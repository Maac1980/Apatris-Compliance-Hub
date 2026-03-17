import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useGetComplianceReport } from "@workspace/api-client-react";
import { Download, FileWarning, AlertTriangle } from "lucide-react";
import { format, parseISO } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function exportPDF(report: any) {
  const doc = new jsPDF({ orientation: "landscape" });
  const red: [number, number, number] = [196, 30, 24];
  const dark: [number, number, number] = [15, 23, 42];
  const slate: [number, number, number] = [30, 41, 59];

  doc.setFillColor(...dark);
  doc.rect(0, 0, doc.internal.pageSize.width, doc.internal.pageSize.height, "F");

  doc.setFillColor(...red);
  doc.rect(0, 0, doc.internal.pageSize.width, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("APATRIS — COMPLIANCE MASTER REPORT", 14, 14);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Generated: ${format(new Date(), "MMM d, yyyy HH:mm")}`, doc.internal.pageSize.width - 14, 14, { align: "right" });

  doc.setTextColor(148, 163, 184);
  doc.setFontSize(9);
  doc.text(`Total Workers: ${report.totalWorkers}   Critical: ${report.critical.length}   Warnings: ${report.warning?.length ?? 0}`, 14, 30);

  const allDocs = [
    ...(report.critical || []).map((d: any) => ({ ...d, _status: "CRITICAL" })),
    ...(report.warning || []).map((d: any) => ({ ...d, _status: "WARNING" })),
  ];

  autoTable(doc, {
    startY: 36,
    head: [["Worker", "Document Type", "Expiry Date", "Days Left", "Status"]],
    body: allDocs.map((d) => [
      d.workerName,
      d.documentType,
      d.expiryDate ? format(parseISO(d.expiryDate), "MMM d, yyyy") : "—",
      d.daysUntilExpiry ?? "—",
      d._status,
    ]),
    styles: { fillColor: slate, textColor: [241, 245, 249], fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: red, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 9 },
    alternateRowStyles: { fillColor: dark },
    didParseCell: (data) => {
      if (data.column.index === 4) {
        if (data.cell.raw === "CRITICAL") data.cell.styles.textColor = [239, 68, 68];
        else if (data.cell.raw === "WARNING") data.cell.styles.textColor = [234, 179, 8];
      }
    },
  });

  const filename = `apatris-compliance-${format(new Date(), "yyyy-MM-dd")}.pdf`;
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.target = "_blank"; a.rel = "noopener noreferrer";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

export function ComplianceReportModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const { data: report, isLoading } = useGetComplianceReport({ query: { enabled: isOpen } as any });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card border border-white/10 shadow-2xl max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader className="border-b border-white/5 pb-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-2xl font-display font-bold flex items-center gap-2 text-white">
                <FileWarning className="w-6 h-6 text-primary" />
                Compliance Master Report
              </DialogTitle>
              <DialogDescription className="text-muted-foreground mt-1 font-mono text-sm">
                Generated: {report?.generatedAt ? format(parseISO(report.generatedAt), "MMM d, yyyy HH:mm") : "..."}
              </DialogDescription>
            </div>
            <button
              onClick={() => report && exportPDF(report)}
              disabled={!report}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-white border border-primary/50 rounded-lg text-sm font-display uppercase tracking-wider transition-colors"
            >
              <Download className="w-4 h-4" />
              Export PDF
            </button>
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="py-20 flex justify-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : report ? (
          <div className="space-y-8">
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-center">
                <p className="text-4xl font-mono font-bold text-white">{report.totalWorkers}</p>
                <p className="text-xs font-display uppercase tracking-widest text-muted-foreground mt-1">Total Monitored</p>
              </div>
              <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-center">
                <p className="text-4xl font-mono font-bold text-destructive">{report.critical.length}</p>
                <p className="text-xs font-display uppercase tracking-widest text-destructive mt-1">Critical Action Reqd</p>
              </div>
              <div className="p-4 rounded-xl bg-warning/10 border border-warning/20 text-center">
                <p className="text-4xl font-mono font-bold text-warning">{report.warning.length}</p>
                <p className="text-xs font-display uppercase tracking-widest text-warning mt-1">Warnings (30-60d)</p>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
              <p className="text-sm text-primary/80 font-mono leading-relaxed">{report.summary}</p>
            </div>

            {report.critical.length > 0 && (
              <div>
                <h3 className="text-lg font-display font-bold text-destructive flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-5 h-5" /> Urgent Expirations (Next 30 Days)
                </h3>
                <div className="rounded-lg border border-white/5 overflow-hidden">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-white/5 text-muted-foreground font-display tracking-wider uppercase text-xs">
                      <tr>
                        <th className="px-4 py-3">Worker</th>
                        <th className="px-4 py-3">Document</th>
                        <th className="px-4 py-3">Expiry Date</th>
                        <th className="px-4 py-3 text-right">Days Left</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-mono">
                      {report.critical.map((doc: any, i: number) => (
                        <tr key={i} className="hover:bg-white/5 transition-colors">
                          <td className="px-4 py-3 font-sans text-white">{doc.workerName}</td>
                          <td className="px-4 py-3 text-muted-foreground">{doc.documentType}</td>
                          <td className="px-4 py-3 text-destructive">{format(parseISO(doc.expiryDate), "MMM d, yyyy")}</td>
                          <td className="px-4 py-3 text-right font-bold text-destructive">{doc.daysUntilExpiry}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="py-10 text-center text-muted-foreground">Failed to load report.</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
