import type { Metadata } from "next";
import { Playground } from "@/components/play/Playground";
import { Footer } from "@/components/site/Footer";
import { site } from "@/lib/site";
import manifest from "@/lib/sql/datasets.gen.json";

export const metadata: Metadata = {
  title: "online postgres playground: run sql in your browser",
  description: `a free online sql playground: write sql and run it on a real ${site.pg.engine}, compiled to webassembly and running in your browser. sample databases included, no signup, nothing leaves your machine.`,
  alternates: { canonical: "/play" },
  openGraph: { url: "/play" },
};

const mb = (n: number) => (n / 1e6).toFixed(1);

export default function Play() {
  return (
    <main id="main" className="px-[var(--gutter)] pt-14">
      <header className="mx-auto max-w-[36rem] text-center">
        <div className="font-mono text-12 text-faint">everything.play</div>
        <h1 className="mt-4 font-display text-[clamp(2.3rem,1.6rem+2.4vw,3.2rem)] leading-[1.08] font-light text-hi">play</h1>
        <p className="mt-4 text-18 leading-[1.6] text-mute italic">
          write sql, run it right here, on a real postgres {site.pg.version} compiled to webassembly. nothing leaves your machine.
        </p>
        <span className="ornament mt-9" aria-hidden />
      </header>

      <div className="mt-10">
        <Playground />
      </div>

      <section className="mx-auto mt-16 max-w-[40rem] text-[1.06rem] leading-[1.75] text-ink">
        <h2 className="text-center font-display text-[1.7rem] font-light text-hi">how this works, honestly</h2>
        <p className="mt-4">
          this is the real postgres {site.pg.version} source, compiled to webassembly by the{" "}
          <a className="link" href="https://pglite.dev" target="_blank" rel="noreferrer">
            PGlite
          </a>{" "}
          project ({manifest.pglite}), running in a web worker in this tab. the first run downloads about {mb(manifest.download)} MB, once.
          then it builds the dataset you picked from plain sql, which takes a second or so, and keeps a snapshot of it in memory.
        </p>
        <p className="mt-4">
          every run starts from a fresh copy of that snapshot, unless &ldquo;keep changes between runs&rdquo; is on: then your tables and
          rows stay until you reset. the book&apos;s code blocks always start fresh, so they print exactly what the book shows. the book
          checks every one of them against this same engine.
        </p>
        <p className="mt-4">it is postgres, but a postgres with a few things missing:</p>
        <ul className="mt-3 space-y-2 pl-5 [&>li]:list-['–_'] [&>li]:marker:text-accent-2">
          <li>
            one connection. there&apos;s no second session, so nothing here can show two transactions racing or a lock wait. the book shows
            those with recordings from a real server.
          </li>
          <li>no background processes: no autovacuum, no background writer or checkpointer, no parallel workers.</li>
          <li>text sorts in byte order by default (the C collation; the ICU root collation &quot;unicode&quot; is there too, language-specific ones aren&apos;t), and the clock and random() are your machine&apos;s.</li>
          <li>
            no files on the server and no COPY ... FROM STDIN. the extensions are the six for looking inside:{" "}
            {manifest.extensions.join(", ")}.
          </li>
          <li>
            a running query can&apos;t be cancelled from inside, so after {30} seconds the whole engine is stopped and started again. kept
            changes are lost when that happens.
          </li>
        </ul>
        <p className="mt-4">
          the glue is small and lives in{" "}
          <a className="link" href={`${site.repo}/tree/main/public/sql`} target="_blank" rel="noreferrer">
            public/sql
          </a>{" "}
          and the datasets in{" "}
          <a className="link" href={`${site.repo}/tree/main/datasets`} target="_blank" rel="noreferrer">
            datasets/
          </a>
          , all plain sql.
        </p>
      </section>
      <Footer />
    </main>
  );
}
