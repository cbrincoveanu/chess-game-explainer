import type { EngineTransport } from "./transport.ts";
import {
  parseBestmove,
  parseInfoLine,
  type InfoLine,
} from "./uci.ts";

export interface EvalRequest {
  fen: string;
  depth?: number;
  movetimeMs?: number;
  multipv?: number;
}

export interface EvalResult {
  /** Ranked principal variations, one per requested multipv slot. */
  lines: InfoLine[];
  bestmove: string | null;
  ponder: string | null;
}

type LineHandler = (line: string) => void;

/**
 * Promise-based wrapper around a UCI engine (Stockfish) running behind an
 * EngineTransport. Commands are serialized; searches run one at a time.
 * All scores are from the side-to-move's perspective.
 */
export class EngineClient {
  private readonly handlers = new Set<LineHandler>();
  private queue: Promise<unknown> = Promise.resolve();
  private multipv = 1;

  private constructor(private readonly transport: EngineTransport) {
    transport.onLine((line) => {
      for (const handler of [...this.handlers]) handler(line);
    });
  }

  static async create(
    transport: EngineTransport,
    options?: { multipv?: number; hashMb?: number },
  ): Promise<EngineClient> {
    const client = new EngineClient(transport);
    const failure = new Promise<never>((_, reject) => {
      transport.onError((message) =>
        reject(new Error(`engine failed to start: ${message}`)),
      );
    });
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("engine startup timed out")), 60_000);
    });
    await Promise.race([client.run("uci", "uciok"), failure, timeout]);
    transport.send("setoption name Threads value 1");
    if (options?.hashMb) {
      transport.send(`setoption name Hash value ${options.hashMb}`);
    }
    if (options?.multipv) {
      client.multipv = options.multipv;
      transport.send(`setoption name MultiPV value ${options.multipv}`);
    }
    await Promise.race([client.run("isready", "readyok"), failure]);
    return client;
  }

  async newGame(): Promise<void> {
    await this.enqueue(async () => {
      this.transport.send("ucinewgame");
      await this.run("isready", "readyok");
    });
  }

  async evaluate(request: EvalRequest): Promise<EvalResult> {
    const wantedMultipv = request.multipv ?? this.multipv;
    return this.enqueue(async () => {
      if (wantedMultipv !== this.multipv) {
        this.multipv = wantedMultipv;
        this.transport.send(`setoption name MultiPV value ${wantedMultipv}`);
        await this.run("isready", "readyok");
      }
      const lines = new Map<number, InfoLine>();
      const best: { value: { bestmove: string; ponder: string | null } | null } = {
        value: null,
      };
      const collect: LineHandler = (line) => {
        const info = parseInfoLine(line);
        if (info) {
          lines.set(info.multipv, info);
          return;
        }
        const parsed = parseBestmove(line);
        if (parsed) best.value = parsed;
      };
      this.handlers.add(collect);
      try {
        this.transport.send(`position fen ${request.fen}`);
        const done = this.waitLine((line) => line.startsWith("bestmove"));
        const go: string[] = ["go"];
        if (request.depth) go.push(`depth ${request.depth}`);
        if (request.movetimeMs) go.push(`movetime ${request.movetimeMs}`);
        if (!request.depth && !request.movetimeMs) go.push("depth 12");
        this.transport.send(go.join(" "));
        await done;
      } finally {
        this.handlers.delete(collect);
      }
      return {
        lines: [...lines.values()].sort((a, b) => a.multipv - b.multipv),
        bestmove: best.value ? best.value.bestmove : null,
        ponder: best.value ? best.value.ponder : null,
      };
    });
  }

  async quit(): Promise<void> {
    await this.enqueue(async () => {
      this.transport.send("quit");
    });
    this.transport.terminate();
  }

  private waitLine(pred: (line: string) => boolean): Promise<void> {
    return new Promise((resolve) => {
      const handler: LineHandler = (line) => {
        if (pred(line)) {
          this.handlers.delete(handler);
          resolve();
        }
      };
      this.handlers.add(handler);
    });
  }

  private async run(cmd: string, terminator: string): Promise<void> {
    const done = this.waitLine((line) => line.trim().startsWith(terminator));
    this.transport.send(cmd);
    await done;
  }

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = this.queue.then(job);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
