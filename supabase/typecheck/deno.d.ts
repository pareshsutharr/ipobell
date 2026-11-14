// Stand-ins so the Edge Functions can be type-checked with plain TypeScript (Deno is not needed on the machine).
// Used only by supabase/typecheck/tsconfig.json; never deployed.
declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): void };
declare module "https://deno.land/x/denomailer@1.6.0/mod.ts" {
  export class SMTPClient {
    constructor(opts: { connection: { hostname: string; port: number; tls: boolean; auth: { username: string; password: string } } });
    send(m: { from: string; to: string[]; replyTo?: string; subject: string; content: string; html: string }): Promise<void>;
    close(): Promise<void>;
  }
}
