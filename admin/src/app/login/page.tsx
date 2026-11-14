import { Suspense } from "react";

import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr]">
      <section className="hidden lg:flex flex-col justify-between p-12 text-white" style={{ background: "linear-gradient(160deg, #0F2D52 0%, #07172E 100%)" }}>
        <div>
          <p className="text-[11px] tracking-[0.18em] uppercase text-white/50">Be IPO Ready · Admin</p>
        </div>
        <div className="max-w-[460px]">
          <h1 className="text-[40px] leading-[1.1]">The desk behind every business insight in the app.</h1>
          <p className="text-white/70 mt-5 text-[15px] leading-relaxed">
            Write the story of how a company got listed, publish it to thousands of business owners, and follow up on the leads the app brings in.
          </p>
        </div>
        <p className="text-white/40 text-[12px]">Surat · beipoready.com</p>
      </section>
      <section className="flex items-center justify-center p-8">
        <Suspense>
          <LoginForm />
        </Suspense>
      </section>
    </div>
  );
}
