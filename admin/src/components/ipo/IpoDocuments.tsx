"use client";

// Offer documents for one IPO (public.ipo_documents_admin): upload a DRHP / RHP / prospectus PDF, read its text
// page by page and store both. The PDF is read here in the browser, so no server time limit or upload size
// limit applies; the file goes straight to the `ipo-documents` storage bucket.
import { FileText, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Badge, Button, Card } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { batchPages, checkPdfFile, DOC_TYPES, docTypeLabel, extractionSummary, extractPages, type DocType, type PdfDocumentLike } from "@/lib/pdf-text";
import { supabaseBrowser } from "@/lib/supabase/client";

export interface IpoDocumentRow {
  id: string;
  doc_type: string;
  version: number;
  is_current: boolean;
  file_path: string;
  file_name: string;
  file_size: number;
  page_count: number | null;
  pages_with_text: number | null;
  text_status: "pending" | "extracting" | "done" | "failed";
  text_error: string | null;
  created_at: string;
}

const BUCKET = "ipo-documents";
const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;

async function openPdf(data: ArrayBuffer): Promise<PdfDocumentLike> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"; // copied from node_modules by scripts/copy-pdf-worker.mjs
  return (await pdfjs.getDocument({ data }).promise) as unknown as PdfDocumentLike;
}

export function IpoDocuments({ ipoId, initial, notSetUp }: { ipoId: string; initial: IpoDocumentRow[]; notSetUp: boolean }) {
  const router = useRouter();
  const [docType, setDocType] = useState<DocType>("drhp");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    const supabase = supabaseBrowser();
    const id = crypto.randomUUID();
    const path = `ipo/${ipoId}/${id}.pdf`;
    let stored = false;
    let rowCreated = false;
    try {
      const problem = checkPdfFile(file, new Uint8Array(await file.slice(0, 1024).arrayBuffer()));
      if (problem) throw new Error(problem);

      // Open it first: a damaged or password-protected file is refused before anything is uploaded.
      setStep("Opening the PDF…");
      let doc: PdfDocumentLike;
      try {
        doc = await openPdf(await file.arrayBuffer());
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        throw new Error(/password/i.test(msg) ? "This PDF is password-protected. Upload the unprotected version." : "This PDF could not be opened. It may be damaged.");
      }

      setStep(`Uploading ${mb(file.size)}…`);
      const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: "application/pdf", upsert: false });
      if (up.error) throw new Error(/bucket/i.test(up.error.message) ? "The document storage is not set up yet. Apply the migration 20261114001400_ipo_documents.sql." : up.error.message);
      stored = true;

      const ins = await supabase.from("ipo_documents_admin").insert({ id, ipo_id: ipoId, doc_type: docType, file_path: path, file_name: file.name.slice(0, 200), file_size: file.size, text_status: "extracting", page_count: doc.numPages });
      if (ins.error) throw new Error(ins.error.message);
      rowCreated = true;

      const result = await extractPages(doc, (done, total) => setStep(`Reading page ${done} of ${total}…`));
      const batches = batchPages(result.pages);
      for (let i = 0; i < batches.length; i++) {
        setStep(`Saving text ${i + 1} of ${batches.length}…`);
        const { error: err } = await supabase.from("ipo_document_pages").insert(batches[i].map((p) => ({ document_id: id, page_no: p.page_no, text: p.text })));
        if (err) throw new Error(err.message);
      }

      const summary = extractionSummary(result);
      const done = await supabase.from("ipo_documents_admin").update({ text_status: summary.ok ? "done" : "failed", text_error: summary.ok ? null : summary.message.slice(0, 500), page_count: result.pageCount, pages_with_text: result.pagesWithText }).eq("id", id);
      if (done.error) throw new Error(done.error.message);
      if (summary.ok) setNotice(`${docTypeLabel(docType)} uploaded. ${summary.message}`);
      else setError(summary.message);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Upload failed.";
      setError(message);
      // Leave nothing half-done: a row is marked failed with the reason; a file with no row is removed.
      if (rowCreated) await supabase.from("ipo_documents_admin").update({ text_status: "failed", text_error: message.slice(0, 500) }).eq("id", id);
      else if (stored) await supabase.storage.from(BUCKET).remove([path]);
    } finally {
      setBusy(false);
      setStep(null);
      if (fileInput.current) fileInput.current.value = "";
      router.refresh();
    }
  };

  const remove = async (doc: IpoDocumentRow) => {
    if (!window.confirm(`Delete ${docTypeLabel(doc.doc_type)} version ${doc.version} (${doc.file_name})? Its stored text is deleted too.`)) return;
    setDeleting(doc.id);
    setError(null);
    const supabase = supabaseBrowser();
    const { error: err } = await supabase.from("ipo_documents_admin").delete().eq("id", doc.id);
    if (err) setError(err.message);
    else await supabase.storage.from(BUCKET).remove([doc.file_path]);
    setDeleting(null);
    router.refresh();
  };

  const publicUrl = (path: string) => supabaseBrowser().storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  return (
    <Card className="mb-6">
      <h2 className="text-[17px]">Offer documents</h2>
      <p className="text-ink-3 text-[13px] mt-1 max-w-[760px]">
        Upload the DRHP, RHP or final prospectus as a PDF (up to 50 MB). The text of every page is stored so a summary can be drafted from it and questions can later be answered with a page number. Use the text PDF from the exchange or SEBI site, not a scan.
      </p>

      {notSetUp ? (
        <div className="rounded-[10px] border border-amber/30 bg-amber-soft px-4 py-3 text-[13px] mt-4">Document upload is not set up in the database yet. Apply the migration 20261114001400_ipo_documents.sql.</div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <select className="field h-10 !w-auto pr-8" value={docType} disabled={busy} onChange={(e) => setDocType(e.target.value as DocType)}>
            {DOC_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <label className={`inline-flex items-center gap-2 h-10 px-4 rounded-[10px] border border-line-strong bg-white text-sm font-medium ${busy ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-ink-3"}`}>
            <Upload size={15} /> {busy ? "Working…" : "Choose PDF"}
            <input ref={fileInput} type="file" accept="application/pdf,.pdf" className="hidden" disabled={busy} onChange={(e) => void upload(e.target.files?.[0])} />
          </label>
          {step ? <span className="text-[13px] text-ink-2 num">{step} Keep this tab open.</span> : null}
        </div>
      )}

      {error ? <div className="rounded-[10px] border border-red/30 bg-red-soft text-red px-4 py-3 text-[13px] mt-4">{error}</div> : null}
      {notice ? <div className="rounded-[10px] border border-green/30 bg-green-soft text-green px-4 py-3 text-[13px] mt-4">{notice}</div> : null}

      {initial.length ? (
        <div className="mt-5 overflow-x-auto border border-line rounded-[10px]">
          <table className="data">
            <thead>
              <tr>
                <th>Document</th>
                <th>File</th>
                <th className="text-right">Pages</th>
                <th>Text</th>
                <th>Uploaded</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {initial.map((doc) => (
                <tr key={doc.id}>
                  <td className="whitespace-nowrap">
                    <span className="font-medium">{docTypeLabel(doc.doc_type)}</span> <span className="text-ink-3">v{doc.version}</span> {doc.is_current ? <Badge tone="green">Current</Badge> : <Badge tone="neutral">Older</Badge>}
                  </td>
                  <td>
                    <a href={publicUrl(doc.file_path)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-navy hover:underline">
                      <FileText size={14} /> {doc.file_name}
                    </a>
                    <span className="text-ink-3 text-[12px] ml-2 num">{mb(doc.file_size)}</span>
                  </td>
                  <td className="num text-right">{doc.page_count ?? "—"}</td>
                  <td>
                    {doc.text_status === "done" ? (
                      <span className="text-[13px]">
                        <Badge tone="green">Read</Badge> <span className="text-ink-3 num">{doc.pages_with_text ?? 0} of {doc.page_count ?? 0} pages</span>
                      </span>
                    ) : doc.text_status === "failed" ? (
                      <span title={doc.text_error ?? ""}>
                        <Badge tone="red">Failed</Badge> <span className="text-ink-3 text-[12px]">{doc.text_error ?? ""}</span>
                      </span>
                    ) : (
                      <span title="If no upload is running in a browser tab, this one was interrupted: delete it and upload again.">
                        <Badge tone="amber">Not finished</Badge>
                      </span>
                    )}
                  </td>
                  <td className="num text-ink-2 whitespace-nowrap">{dateTime(doc.created_at)}</td>
                  <td className="text-right">
                    <Button variant="danger" size="sm" disabled={busy || deleting === doc.id} onClick={() => void remove(doc)}>
                      <Trash2 size={14} /> {deleting === doc.id ? "Deleting…" : "Delete"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !notSetUp ? (
        <p className="text-ink-3 text-[13px] mt-4">No documents uploaded for this IPO yet.</p>
      ) : null}
    </Card>
  );
}
