import WordExtractor from 'word-extractor';
import * as fs from 'fs';

async function test() {
  try {
    const extractor = new WordExtractor();
    const doc = await extractor.extract(Buffer.from('hello'));
    console.log("Extracted:", doc.getBody());
  } catch (err: any) {
    console.error("Error:", err.message);
  }
}
test();
