import WordExtractor from 'word-extractor';

export async function extractDoc(arrayBuffer) {
    const extractor = new WordExtractor();
    const buffer = Buffer.from(arrayBuffer);
    const document = await extractor.extract(buffer);
    return document.getBody();
}
