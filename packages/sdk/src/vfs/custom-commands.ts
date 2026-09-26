import type { Command, CustomCommand } from "just-bash/browser";
import { defineCommand } from "just-bash/browser";
import { loadSavedConfig } from "../provider-config";
import { loadWebConfig } from "../web/config";
import { fetchWeb } from "../web/fetch";
import { searchImages, searchWeb } from "../web/search";

interface CommandFs {
  mkdir(path: string, options: { recursive: boolean }): Promise<void>;
  readFileBuffer(path: string): Promise<Uint8Array>;
  writeFile(path: string, content: string | Uint8Array): Promise<void>;
}

interface CommandContext {
  cwd: string;
  fs: CommandFs;
}

export interface SharedCustomCommandOptions {
  includeImageSearch?: boolean;
}

function resolvePath(cwd: string, filePath: string): string {
  return filePath.startsWith("/") ? filePath : `${cwd}/${filePath}`;
}

async function resolveVfsPath(
  ctx: CommandContext,
  filePath: string,
): Promise<Uint8Array> {
  return ctx.fs.readFileBuffer(resolvePath(ctx.cwd, filePath));
}

async function writeVfsOutput(
  ctx: CommandContext,
  outFile: string,
  content: string | Uint8Array,
): Promise<string> {
  const resolved = resolvePath(ctx.cwd, outFile);
  const dir = resolved.substring(0, resolved.lastIndexOf("/"));
  if (dir && dir !== "/") {
    try {
      await ctx.fs.mkdir(dir, { recursive: true });
    } catch {
      // directory may already exist
    }
  }
  await ctx.fs.writeFile(resolved, content);
  return resolved;
}

function parsePageRanges(spec: string, maxPage: number): Set<number> {
  const pages = new Set<number>();
  for (const part of spec.split(",")) {
    const trimmed = part.trim();
    const rangeParts = trimmed.split("-");
    if (rangeParts.length === 2) {
      const start = Math.max(1, Number.parseInt(rangeParts[0], 10));
      const end = Math.min(maxPage, Number.parseInt(rangeParts[1], 10));
      if (!Number.isNaN(start) && !Number.isNaN(end)) {
        for (let i = start; i <= end; i++) pages.add(i);
      }
    } else {
      const page = Number.parseInt(trimmed, 10);
      if (!Number.isNaN(page) && page >= 1 && page <= maxPage) {
        pages.add(page);
      }
    }
  }
  return pages;
}

function parseFlags(args: string[]): {
  flags: Record<string, string>;
  positional: string[];
} {
  const flags: Record<string, string> = {};
  const positional: string[] = [];

  for (const arg of args) {
    const match = arg.match(/^--(\w+)=(.+)$/);
    if (match) {
      flags[match[1]] = match[2];
    } else if (arg === "--json") {
      flags.json = "true";
    } else {
      positional.push(arg);
    }
  }

  return { flags, positional };
}

function getProxyUrl(): string | undefined {
  const config = loadSavedConfig();
  return config?.useProxy && config?.proxyUrl ? config.proxyUrl : undefined;
}

const LLAMAPARSE_HOST = "https://api.cloud.llamaindex.ai";

async function parseWithLlamaParse(
  data: Uint8Array,
  apiKey: string,
  proxyUrl?: string,
): Promise<string> {
  function makeUrl(path: string): string {
    const url = `${LLAMAPARSE_HOST}${path}`;
    return proxyUrl ? `${proxyUrl}?url=${encodeURIComponent(url)}` : url;
  }

  const authHeaders = { Authorization: `Bearer ${apiKey}` };

  const blob = new Blob([data.slice() as BlobPart], {
    type: "application/pdf",
  });
  const form = new FormData();
  form.append("file", blob, "document.pdf");
  form.append(
    "configuration",
    JSON.stringify({ tier: "fast", version: "latest" }),
  );

  const uploadRes = await fetch(makeUrl("/api/v2/parse/upload"), {
    method: "POST",
    headers: authHeaders,
    body: form,
  });
  if (!uploadRes.ok) {
    const body = await uploadRes.text().catch(() => "");
    throw new Error(`LlamaParse upload failed (${uploadRes.status}): ${body}`);
  }
  const uploadData = (await uploadRes.json()) as {
    id: string;
    status: string;
    error_message?: string | null;
  };
  const jobId = uploadData.id;
  if (!jobId) {
    throw new Error(
      `LlamaParse upload returned no job id: ${JSON.stringify(uploadData).slice(0, 200)}`,
    );
  }

  const maxAttempts = 120;
  let delay = 1000;
  let lastStatus = "";
  let lastHttpStatus = 0;
  let successfulPolls = 0;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.5, 5000);

    let statusRes: Response;
    try {
      statusRes = await fetch(makeUrl(`/api/v2/parse/${jobId}`), {
        headers: authHeaders,
      });
    } catch {
      continue;
    }
    lastHttpStatus = statusRes.status;
    if (!statusRes.ok) continue;

    successfulPolls++;
    const result = (await statusRes.json()) as Record<string, unknown>;
    const job = (result.job ?? result) as { status?: string };
    const status = job.status ?? "";
    lastStatus = status;

    if (status === "FAILED" || status === "CANCELLED") {
      throw new Error(`LlamaParse job ${status.toLowerCase()}`);
    }
    if (status === "COMPLETED") {
      const mdRes = await fetch(
        makeUrl(`/api/parsing/job/${jobId}/result/markdown`),
        { headers: authHeaders },
      );
      if (!mdRes.ok) {
        throw new Error(`LlamaParse result fetch failed (${mdRes.status})`);
      }
      const mdData = (await mdRes.json()) as { markdown?: string };
      if (!mdData.markdown) {
        throw new Error("LlamaParse returned no content");
      }
      return mdData.markdown;
    }
  }
  throw new Error(
    `LlamaParse timed out (last status: ${lastStatus || "none"}, ` +
      `last HTTP: ${lastHttpStatus || "none"}, ` +
      `successful polls: ${successfulPolls}/${maxAttempts})`,
  );
}

async function initPdfjs() {
  await import("pdfjs-dist/build/pdf.worker.mjs");
  const pdfjsLib = await import("pdfjs-dist");
  if (
    !pdfjsLib.GlobalWorkerOptions.workerSrc &&
    typeof import.meta.url !== "undefined"
  ) {
    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.mjs",
        import.meta.url,
      ).toString();
    } catch {
      // Side-effect import already loaded the worker into main thread
    }
  }
  return pdfjsLib;
}

const pdfToText: CustomCommand = {
  name: "pdf-to-text",
  load: async () =>
    defineCommand("pdf-to-text", async (args, ctx) => {
      if (args.length < 2) {
        return {
          stdout: "",
          stderr:
            "Usage: pdf-to-text <file> <outfile>\n  file    - Path to PDF file in VFS\n  outfile - Output text file\n",
          exitCode: 1,
        };
      }

      const [filePath, outFile] = args;

      try {
        const rawData = await resolveVfsPath(ctx, filePath);
        const data = new Uint8Array(rawData);

        const header = String.fromCharCode(
          data[0],
          data[1],
          data[2],
          data[3],
          data[4],
        );
        if (data.length < 5 || header !== "%PDF-") {
          return {
            stdout: "",
            stderr: `Not a valid PDF file (missing %PDF- header). Try: pdf-to-images ${filePath} /tmp/pages`,
            exitCode: 1,
          };
        }

        const webConfig = loadWebConfig();
        const llamaKey = webConfig.apiKeys.llamaparse;
        let llamaError = "";

        if (llamaKey) {
          try {
            const fullText = await parseWithLlamaParse(
              data,
              llamaKey,
              getProxyUrl(),
            );
            await writeVfsOutput(ctx, outFile, fullText);
            return {
              stdout: `Extracted text via LlamaParse to ${outFile} (${fullText.length} chars)`,
              stderr: "",
              exitCode: 0,
            };
          } catch (llamaErr) {
            llamaError =
              llamaErr instanceof Error ? llamaErr.message : String(llamaErr);
            const isCors =
              llamaError.includes("Failed to fetch") ||
              llamaError.includes("NetworkError") ||
              llamaError.includes("Load failed");
            if (isCors) {
              llamaError +=
                " (likely CORS — ensure your proxy is running and Proxy URL is set in Settings)";
            }
          }
        }

        const pdfjsLib = await initPdfjs();

        const pdfjsExtraOpts = [
          {},
          { stopAtErrors: false, disableFontFace: true },
        ];

        let doc: Awaited<
          ReturnType<typeof pdfjsLib.getDocument>["promise"]
        > | null = null;
        let lastPdfjsErr: unknown;

        for (const extra of pdfjsExtraOpts) {
          try {
            const freshBuf = data.slice().buffer as ArrayBuffer;
            doc = await pdfjsLib.getDocument({
              data: freshBuf,
              useWorkerFetch: false,
              isEvalSupported: false,
              useSystemFonts: true,
              disableAutoFetch: true,
              disableStream: true,
              ...extra,
            }).promise;
            break;
          } catch (e) {
            lastPdfjsErr = e;
          }
        }

        if (!doc) {
          const pdfjsMsg =
            lastPdfjsErr instanceof Error
              ? lastPdfjsErr.message
              : String(lastPdfjsErr);
          const parts = [pdfjsMsg];
          if (llamaError) {
            parts.push(`LlamaParse also failed: ${llamaError}`);
          } else if (!llamaKey) {
            parts.push(
              "Tip: configure a LlamaParse API key in Settings > Web Tools for better PDF support.",
            );
          }
          parts.push(
            `Fallback: use pdf-to-images ${filePath} /tmp/pages --pages=1,2,3 to render as images instead.`,
          );
          return { stdout: "", stderr: parts.join("\n"), exitCode: 1 };
        }

        const pages: string[] = [];

        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const content = await page.getTextContent();
          let lastY: number | null = null;
          const parts: string[] = [];
          for (const item of content.items) {
            if (!("str" in item)) continue;
            const textItem = item as { str: string; transform: number[] };
            const y = textItem.transform[5];
            if (lastY !== null && Math.abs(y - lastY) > 2) {
              parts.push("\n");
            }
            parts.push(textItem.str);
            lastY = y;
          }
          const text = parts.join("").trim();
          if (text) pages.push(text);
        }

        const fullText = pages.join("\n\n");
        await writeVfsOutput(ctx, outFile, fullText);

        return {
          stdout: `Extracted text from ${doc.numPages} page(s) to ${outFile} (${fullText.length} chars)`,
          stderr: "",
          exitCode: 0,
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          stdout: "",
          stderr: `${msg}\nFallback: use pdf-to-images ${filePath} /tmp/pages --pages=1,2,3 to render as images instead.`,
          exitCode: 1,
        };
      }
    }),
};

const pdfToImages: CustomCommand = {
  name: "pdf-to-images",
  load: async () =>
    defineCommand("pdf-to-images", async (args, ctx) => {
      const positional = args.filter((arg) => !arg.startsWith("--"));
      const scaleArg = args.find((arg) => arg.startsWith("--scale="));
      const pagesArg = args.find((arg) => arg.startsWith("--pages="));

      if (positional.length < 2) {
        return {
          stdout: "",
          stderr:
            "Usage: pdf-to-images <file> <outdir> [--scale=N] [--pages=1,3,5-8]\n  file    - Path to PDF file in VFS\n  outdir  - Output directory for PNG images\n  --scale - Render scale factor (default: 2)\n  --pages - Page selection (e.g. 1,3,5-8). Default: all\n",
          exitCode: 1,
        };
      }

      const [filePath, outDir] = positional;
      const scale = scaleArg ? Number.parseFloat(scaleArg.split("=")[1]) : 2;

      if (Number.isNaN(scale) || scale <= 0 || scale > 5) {
        return {
          stdout: "",
          stderr: "Scale must be between 0 and 5",
          exitCode: 1,
        };
      }

      try {
        const rawData = await resolveVfsPath(ctx, filePath);
        const data = new Uint8Array(rawData);
        const pdfjsLib = await initPdfjs();

        const pdfjsExtraOpts = [
          {},
          { stopAtErrors: false, disableFontFace: true },
        ];

        let doc: Awaited<
          ReturnType<typeof pdfjsLib.getDocument>["promise"]
        > | null = null;
        let lastErr: unknown;

        for (const extra of pdfjsExtraOpts) {
          try {
            const freshBuf = data.slice().buffer as ArrayBuffer;
            doc = await pdfjsLib.getDocument({
              data: freshBuf,
              useWorkerFetch: false,
              isEvalSupported: false,
              useSystemFonts: true,
              disableAutoFetch: true,
              disableStream: true,
              ...extra,
            }).promise;
            break;
          } catch (e) {
            lastErr = e;
          }
        }

        if (!doc) {
          const msg =
            lastErr instanceof Error ? lastErr.message : String(lastErr);
          const webConfig = loadWebConfig();
          const hint = webConfig.apiKeys.llamaparse
            ? msg
            : `${msg}\nTip: configure a LlamaParse API key in Settings > Web Tools for better PDF support.`;
          return { stdout: "", stderr: hint, exitCode: 1 };
        }

        const selectedPages = pagesArg
          ? parsePageRanges(pagesArg.split("=")[1], doc.numPages)
          : new Set(Array.from({ length: doc.numPages }, (_, i) => i + 1));

        if (selectedPages.size === 0) {
          return {
            stdout: "",
            stderr: "No valid pages in selection",
            exitCode: 1,
          };
        }

        const resolvedDir = resolvePath(ctx.cwd, outDir);
        try {
          await ctx.fs.mkdir(resolvedDir, { recursive: true });
        } catch {
          // directory may already exist
        }

        const outputs: string[] = [];
        const sortedPages = [...selectedPages].sort((a, b) => a - b);

        for (const pageNum of sortedPages) {
          const page = await doc.getPage(pageNum);
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          const canvasCtx = canvas.getContext("2d");
          if (!canvasCtx) throw new Error("Failed to create canvas 2D context");

          await page.render({ canvasContext: canvasCtx, canvas, viewport })
            .promise;

          const pngData = await new Promise<Uint8Array>((resolve, reject) => {
            canvas.toBlob((blob) => {
              if (!blob) return reject(new Error("Canvas toBlob failed"));
              blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)));
            }, "image/png");
          });

          const pagePath = `${resolvedDir}/page-${pageNum}.png`;
          await ctx.fs.writeFile(pagePath, pngData);
          outputs.push(
            `page-${pageNum}.png (${Math.round(pngData.length / 1024)}KB, ${canvas.width}×${canvas.height})`,
          );

          canvas.width = 0;
          canvas.height = 0;
        }

        return {
          stdout: `Converted ${outputs.length} page(s) from ${doc.numPages} total to ${outDir}/:\n${outputs.map((o) => `  ${o}`).join("\n")}`,
          stderr: "",
          exitCode: 0,
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { stdout: "", stderr: msg, exitCode: 1 };
      }
    }),
};

const docxToText: CustomCommand = {
  name: "docx-to-text",
  load: async () =>
    defineCommand("docx-to-text", async (args, ctx) => {
      if (args.length < 2) {
        return {
          stdout: "",
          stderr:
            "Usage: docx-to-text <file> <outfile>\n  file    - Path to DOCX file in VFS\n  outfile - Output text file\n",
          exitCode: 1,
        };
      }

      const [filePath, outFile] = args;

      try {
        const data = await resolveVfsPath(ctx, filePath);
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({
          arrayBuffer: data.buffer as ArrayBuffer,
        });

        await writeVfsOutput(ctx, outFile, result.value);

        return {
          stdout: `Extracted text from DOCX to ${outFile} (${result.value.length} chars)`,
          stderr: "",
          exitCode: 0,
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { stdout: "", stderr: msg, exitCode: 1 };
      }
    }),
};

const xlsxToCsv: CustomCommand = {
  name: "xlsx-to-csv",
  load: async () =>
    defineCommand("xlsx-to-csv", async (args, ctx) => {
      if (args.length < 2) {
        return {
          stdout: "",
          stderr:
            "Usage: xlsx-to-csv <file> <outfile> [sheet]\n  file    - Path to XLSX/XLS/ODS file in VFS\n  outfile - Output CSV file (for multiple sheets: <name>.<sheet>.csv)\n  sheet   - Sheet name or 0-based index (optional, exports all sheets if omitted)\n",
          exitCode: 1,
        };
      }

      const [filePath, outFile, sheetArg] = args;

      try {
        const data = await resolveVfsPath(ctx, filePath);
        const XLSX = await import("xlsx");
        const workbook = XLSX.read(data, { type: "array" });

        if (sheetArg) {
          let sheetName: string;
          if (workbook.SheetNames.includes(sheetArg)) {
            sheetName = sheetArg;
          } else {
            const idx = Number.parseInt(sheetArg, 10);
            if (
              !Number.isNaN(idx) &&
              idx >= 0 &&
              idx < workbook.SheetNames.length
            ) {
              sheetName = workbook.SheetNames[idx];
            } else {
              return {
                stdout: "",
                stderr: `Sheet not found: ${sheetArg}. Available: ${workbook.SheetNames.join(", ")}`,
                exitCode: 1,
              };
            }
          }

          const sheet = workbook.Sheets[sheetName];
          if (!sheet) {
            return {
              stdout: "",
              stderr: `Sheet "${sheetName}" not found`,
              exitCode: 1,
            };
          }

          const csv = XLSX.utils.sheet_to_csv(sheet);
          await writeVfsOutput(ctx, outFile, csv);

          return {
            stdout: `Converted sheet "${sheetName}" → ${outFile}`,
            stderr: "",
            exitCode: 0,
          };
        }

        const names = workbook.SheetNames;

        if (names.length === 1) {
          const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[names[0]]);
          await writeVfsOutput(ctx, outFile, csv);
          return {
            stdout: `Converted sheet "${names[0]}" → ${outFile}`,
            stderr: "",
            exitCode: 0,
          };
        }

        const dotIdx = outFile.lastIndexOf(".");
        const base = dotIdx > 0 ? outFile.substring(0, dotIdx) : outFile;
        const ext = dotIdx > 0 ? outFile.substring(dotIdx) : ".csv";
        const outputs: string[] = [];

        for (const name of names) {
          const sheet = workbook.Sheets[name];
          if (!sheet) continue;
          const csv = XLSX.utils.sheet_to_csv(sheet);
          const safeName = name.replace(/[/\\?*[\]]/g, "_");
          const path = `${base}.${safeName}${ext}`;
          await writeVfsOutput(ctx, path, csv);
          outputs.push(`  "${name}" → ${path}`);
        }

        return {
          stdout: `Converted ${names.length} sheets:\n${outputs.join("\n")}`,
          stderr: "",
          exitCode: 0,
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { stdout: "", stderr: msg, exitCode: 1 };
      }
    }),
};

const webSearchCmd: Command = defineCommand("web-search", async (args) => {
  const { flags, positional } = parseFlags(args);
  const query = positional.join(" ");

  if (!query) {
    return {
      stdout: "",
      stderr:
        "Usage: web-search <query> [--max=N] [--region=REGION] [--time=d|w|m|y] [--page=N] [--json]\n  query    - Search query\n  --max    - Max results (default: 10)\n  --region - Region code, e.g. us-en, uk-en (default: us-en)\n  --time   - Time filter: d(ay), w(eek), m(onth), y(ear)\n  --page   - Page number (default: 1)\n  --json   - Output as JSON\n",
      exitCode: 1,
    };
  }

  try {
    const webConfig = loadWebConfig();
    const results = await searchWeb(
      query,
      {
        maxResults: flags.max ? Number.parseInt(flags.max, 10) : 10,
        region: flags.region,
        timelimit: flags.time as "d" | "w" | "m" | "y" | undefined,
        page: flags.page ? Number.parseInt(flags.page, 10) : undefined,
      },
      {
        proxyUrl: getProxyUrl(),
        apiKeys: webConfig.apiKeys,
      },
      webConfig.searchProvider,
    );

    if (results.length === 0) {
      return { stdout: "No results found.", stderr: "", exitCode: 0 };
    }

    if (flags.json === "true") {
      return {
        stdout: JSON.stringify(results, null, 2),
        stderr: "",
        exitCode: 0,
      };
    }

    const lines = results.map(
      (result, index) =>
        `${index + 1}. ${result.title}\n   ${result.href}\n   ${result.body}`,
    );
    return {
      stdout: lines.join("\n\n"),
      stderr: "",
      exitCode: 0,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { stdout: "", stderr: msg, exitCode: 1 };
  }
});

const webFetchCmd: Command = defineCommand("web-fetch", async (args, ctx) => {
  const url = args[0];
  const outFile = args[1];

  if (!url || !outFile) {
    return {
      stdout: "",
      stderr:
        "Usage: web-fetch <url> <outfile>\n  url      - URL to fetch\n  outfile  - Output file path\n\nFetches a URL and saves to a file.\n  - HTML pages: extracts readable content (Markdown)\n  - Binary files (PDF, DOCX, XLSX, etc.): downloads raw file\n  - Text/JSON/XML: saves as-is\n",
      exitCode: 1,
    };
  }

  try {
    const webConfig = loadWebConfig();
    const result = await fetchWeb(
      url,
      {
        proxyUrl: getProxyUrl(),
        apiKeys: webConfig.apiKeys,
      },
      webConfig.fetchProvider,
    );

    if (result.kind === "text") {
      const header = [
        result.title ? `Title: ${result.title}` : "",
        ...Object.entries(result.metadata || {}).map(
          ([key, value]) => `${key}: ${value}`,
        ),
      ]
        .filter(Boolean)
        .join("\n");
      const output = header ? `${header}\n\n${result.text}` : result.text;

      await writeVfsOutput(ctx, outFile, output);
      return {
        stdout: `Fetched text → ${outFile} (${result.text.length} chars, ${result.contentType})`,
        stderr: "",
        exitCode: 0,
      };
    }

    await writeVfsOutput(ctx, outFile, result.data);

    const size =
      result.data.length >= 1024
        ? `${Math.round(result.data.length / 1024)}KB`
        : `${result.data.length}B`;

    return {
      stdout: `Downloaded → ${outFile} (${size}, ${result.contentType || "unknown type"})`,
      stderr: "",
      exitCode: 0,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { stdout: "", stderr: msg, exitCode: 1 };
  }
});

const imageSearchCmd: Command = defineCommand("image-search", async (args) => {
  const { flags, positional } = parseFlags(args);
  const query = positional.join(" ");

  if (!query) {
    return {
      stdout: "",
      stderr:
        "Usage: image-search <query> [--num=N] [--page=N] [--gl=COUNTRY] [--hl=LANG] [--json]\n" +
        "  query  - Image search query\n" +
        "  --num  - Number of results (default: 10)\n" +
        "  --page - Page number (default: 1)\n" +
        "  --gl   - Country code, e.g. us, uk (default: us)\n" +
        "  --hl   - Language code, e.g. en, fr (default: en)\n" +
        "  --json - Output as JSON\n" +
        "\nRequires a Serper API key configured in Settings > Web > API Keys.\n",
      exitCode: 1,
    };
  }

  try {
    const webConfig = loadWebConfig();
    const results = await searchImages(
      query,
      {
        num: flags.num ? Number.parseInt(flags.num, 10) : undefined,
        page: flags.page ? Number.parseInt(flags.page, 10) : undefined,
        gl: flags.gl,
        hl: flags.hl,
      },
      {
        proxyUrl: getProxyUrl(),
        apiKeys: webConfig.apiKeys,
      },
      webConfig.imageSearchProvider,
    );

    if (results.length === 0) {
      return { stdout: "No images found.", stderr: "", exitCode: 0 };
    }

    if (flags.json === "true") {
      return {
        stdout: JSON.stringify(results, null, 2),
        stderr: "",
        exitCode: 0,
      };
    }

    const lines = results.map(
      (result, index) =>
        `${index + 1}. ${result.title}\n   Image: ${result.imageUrl} (${result.imageWidth}×${result.imageHeight})\n   Source: ${result.source} (${result.domain})\n   Page: ${result.link}`,
    );
    return {
      stdout: lines.join("\n\n"),
      stderr: "",
      exitCode: 0,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { stdout: "", stderr: msg, exitCode: 1 };
  }
});

export function getSharedCustomCommands(
  options: SharedCustomCommandOptions = {},
): CustomCommand[] {
  const commands: CustomCommand[] = [
    pdfToText,
    pdfToImages,
    docxToText,
    xlsxToCsv,
    webSearchCmd,
    webFetchCmd,
  ];

  if (options.includeImageSearch) {
    commands.push(imageSearchCmd);
  }

  return commands;
}
