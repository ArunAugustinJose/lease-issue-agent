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
    .split(/\r?\n/)
    .map((text, i) => ({
      id: `${page ? 'p' + page + '-' : ''}line-${i + 1}`,
      text: text.trim(),
      locator: { line: i + 1, ...(page ? { page } : {}) },
    }))
    .filter((c) => c.text);
}
export class TextDocumentParser implements DocumentParser {
  async parse(buffer: Buffer) {
    return lines(new TextDecoder('utf-8', { fatal: true }).decode(buffer));
  }
}
export class DocxDocumentParser implements DocumentParser {
  async parse(buffer: Buffer) {
    const data = await mammoth.extractRawText({ buffer });
    return data.value
      .split(/\n\s*\n/)
      .filter((t) => t.trim())
      .map((text, i) => ({
        id: `paragraph-${i + 1}`,
        text: text.trim(),
        locator: { paragraph: i + 1 },
      }));
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
