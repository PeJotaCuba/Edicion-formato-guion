import { Document, Packer, Paragraph, TextRun, AlignmentType, Header, PageNumber, UnderlineType } from "docx";
import { RadioScript } from "../types";

export interface DocxSettings {
    fontSize: number;
    lineSpacing: number; // 1, 1.15, 1.5
    paragraphSpacing: number; // 3, 6, 10
}

function parseHtmlToTextRuns(htmlString: string, defaultProps: { bold?: boolean, italics?: boolean, underline?: boolean } = {}): TextRun[] {
    const temp = document.createElement('div');
    temp.innerHTML = htmlString;
    const runs: TextRun[] = [];

    function traverse(node: Node, currentProps: { bold?: boolean, italics?: boolean, underline?: boolean }) {
        if (node.nodeType === Node.TEXT_NODE) {
            if (node.textContent && node.textContent.length > 0) {
                runs.push(new TextRun({
                    text: node.textContent,
                    bold: currentProps.bold,
                    italics: currentProps.italics,
                    underline: currentProps.underline ? { type: UnderlineType.SINGLE } : undefined,
                }));
            }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            const newProps = { ...currentProps };
            if (el.tagName === 'B' || el.tagName === 'STRONG') newProps.bold = true;
            if (el.tagName === 'I' || el.tagName === 'EM') newProps.italics = true;
            if (el.tagName === 'U') newProps.underline = true;
            
            // We can also extract comments here if needed in the future using el.dataset.comment

            el.childNodes.forEach(child => traverse(child, newProps));
        }
    }

    temp.childNodes.forEach(child => traverse(child, defaultProps));
    
    // If runs is empty, add at least one empty TextRun to preserve empty paragraphs
    if (runs.length === 0) {
       runs.push(new TextRun({ text: "" }));
    }
    
    return runs;
}

export async function generateRadioScriptDocx(scriptData: RadioScript, settings: DocxSettings): Promise<Blob> {
    const TWIPS_2CM = 1134;

    const children: Paragraph[] = [];

    for (const credit of scriptData.credits) {
        children.push(
            new Paragraph({
                children: [
                    new TextRun({ text: credit.label + ": ", bold: true }),
                    ...parseHtmlToTextRuns(credit.value)
                ]
            })
        );
    }

    children.push(new Paragraph({ text: "" }));

    for (const item of scriptData.body) {
        if (item.type === "sound") {
            const paragraphs = item.text || [];
            paragraphs.forEach((pText, idx) => {
                const isFirst = idx === 0;
                let runs: TextRun[] = [];
                let cleanText = pText;
                
                if (isFirst) {
                    cleanText = cleanText.replace(/^(?:SON|OP)\s*:?\s*/i, '').trim();
                    runs.push(new TextRun({ 
                        text: `${item.identifier} SON: `, 
                        bold: true
                    }));
                }
                
                const parsedRuns = parseHtmlToTextRuns(cleanText.toUpperCase(), { bold: true, underline: true });
                runs = runs.concat(parsedRuns);

                children.push(
                    new Paragraph({
                        children: runs,
                        indent: { left: TWIPS_2CM, hanging: isFirst ? TWIPS_2CM : 0 },
                    })
                );
            });
        } else if (item.type === "speaker") {
            const paragraphs = item.text || [];
            paragraphs.forEach((pText, idx) => {
                const isFirst = idx === 0;
                let runs: TextRun[] = [];
                
                if (isFirst) {
                    const prefixId = item.identifier ? `${item.identifier} ` : "";
                    const prefix = `${prefixId}${item.speakerName || "LOCUTOR"}:`.toUpperCase();
                    runs.push(new TextRun({ text: prefix, bold: true }));

                    if (item.intention) {
                        runs.push(new TextRun({ text: ` (${item.intention.toUpperCase()})`, bold: true }));
                    }

                    runs.push(new TextRun({ text: "\t" }));
                } 
                
                const parsedRuns = parseHtmlToTextRuns(pText);
                runs = runs.concat(parsedRuns);

                children.push(
                    new Paragraph({
                        children: runs,
                        indent: { left: TWIPS_2CM, hanging: isFirst ? TWIPS_2CM : 0 },
                        tabStops: isFirst ? [
                            {
                                type: "left",
                                position: TWIPS_2CM,
                            }
                        ] : []
                    })
                );
            });
        } else if (item.type === "text") {
            const paragraphs = item.text || [];
            paragraphs.forEach((pText) => {
                children.push(
                    new Paragraph({
                        indent: { left: TWIPS_2CM },
                        children: parseHtmlToTextRuns(pText)
                    })
                );
            });
        }
    }

    const lineSpacingTwips = Math.round(settings.lineSpacing * 240);
    const afterSpacingTwips = settings.paragraphSpacing * 20;

    const doc = new Document({
        styles: {
            default: {
                document: {
                    run: {
                        size: settings.fontSize * 2,
                        font: "Arial",
                    },
                    paragraph: {
                        spacing: {
                            line: lineSpacingTwips,
                            after: afterSpacingTwips,
                        },
                    },
                },
            },
        },
        sections: [
            {
                properties: {
                    page: {
                        size: {
                            width: 12240,
                            height: 15840,
                        },
                        margin: {
                            top: 720,
                            right: 720,
                            bottom: 720,
                            left: 720,
                        },
                    },
                },
                headers: {
                    default: new Header({
                        children: [
                            new Paragraph({
                                alignment: AlignmentType.RIGHT,
                                children: [
                                    new TextRun({
                                        children: [PageNumber.CURRENT],
                                        bold: true,
                                        size: 24, // 12pt
                                        font: "Arial"
                                    })
                                ]
                            })
                        ]
                    })
                },
                children: children,
            },
        ],
    });

    return await Packer.toBlob(doc);
}
