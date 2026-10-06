import { BadRequestException } from '@nestjs/common';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
export interface Chunk {
  id: string;
  text: string;
  locator: { page?: number; paragraph?: number; line?: number };
}
export interface DocumentParser {
  parse(buffer: Buffer): Promise<Chunk[]>;
}
function lines(text: string, page?: number): Chunk[] {
  return text
    .split(/\r\n?|\n/)
    .map((text, i) => ({
      id: `${page ? 'p' + page + '-' : ''}line-${i + 1}`,
      text,
      locator: { line: i + 1, ...(page ? { page } : {}) },
    }))
    .filter((c) => c.text.trim());
}
export class TextDocumentParser implements DocumentParser {
  async parse(buffer: Buffer) {
    return lines(new TextDecoder('utf-8', { fatal: true }).decode(buffer));
  }
}
export class DocxDocumentParser implements DocumentParser {
  async parse(buffer: Buffer) {
    const chunks: Chunk[] = [];
    let paragraph = 0,
      table = 0;
    interface Node {
      type: string;
      value?: string;
      children?: Node[];
    }
    const textOf = (node: Node): string =>
      node.type === 'text'
        ? (node.value ?? '')
        : node.type === 'tab'
          ? '\t'
          : node.type === 'break'
            ? '\n'
            : (node.children ?? []).map(textOf).join('');
    function walk(nodes: Node[], prefix = '') {
      let cellParagraph = 0;
      for (const node of nodes) {
        if (node.type === 'table') {
          const tableId = ++table;
          (node.children ?? []).forEach((row, r) =>
            (row.children ?? []).forEach((cell, c) =>
              walk(
                cell.children ?? [],
                `${prefix}table-${tableId}-row-${r + 1}-col-${c + 1}-`,
              ),
            ),
          );
        } else if (node.type === 'paragraph') {
          const text = textOf(node);
          const n = prefix ? ++cellParagraph : ++paragraph;
          if (text.trim())
            chunks.push({
              id: `${prefix}paragraph-${n}`,
              text,
              locator: prefix ? {} : { paragraph: n },
            });
        } else if (node.children) walk(node.children, prefix);
      }
    }
    await mammoth.convertToHtml(
      { buffer },
      {
        externalFileAccess: false,
        transformDocument: (document: Node) => {
          walk(document.children ?? []);
          // Capture Mammoth's table tree before flattening. No HTML or embedded images are needed.
          return { ...document, children: [] };
        },
      },
    );
    return chunks;
  }
}
export class PdfDocumentParser implements DocumentParser {
  async parse(buffer: Buffer) {
    const parser = new PDFParse({ data: buffer });
    try {
      const data = await parser.getText();
      return data.pages.flatMap((p) => lines(p.text, p.num));
    } finally {
      await parser.destroy();
    }
  }
}
export async function parseDocument(
  buffer: Buffer,
  extension: string,
): Promise<Chunk[]> {
  const parser: DocumentParser =
    extension === '.pdf'
      ? new PdfDocumentParser()
      : extension === '.docx'
        ? new DocxDocumentParser()
        : new TextDocumentParser();
  try {
    const chunks = await parser.parse(buffer);
    if (
      chunks.length > 10000 ||
      chunks.reduce((n, c) => n + c.text.length, 0) > 1000000
    )
      throw new Error('Too large');
    if (!chunks.length) throw new Error('Empty');
    return chunks;
  } catch {
    throw new BadRequestException(
      'Could not read this document. Use a text-based PDF, DOCX or UTF-8 TXT; scanned documents require OCR.',
    );
  }
}
