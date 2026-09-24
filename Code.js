/**
 * Serves the HTML web app interface.
 * @param {Object} e Event parameter for HTTP GET requests.
 * @return {GoogleAppsScript.HTML.HtmlOutput}
 */
function doGet(e) {
  const template = HtmlService.createTemplateFromFile('Index');

  // [ACTION_REQUIRED]: Update with your custom stylesheet base URL if using external CSS
  const CSS_BASE_URL = 'INSERT_CSS_URL_HERE';
  const CSS_ENDPOINT = '';
  template.cssUrl = CSS_BASE_URL + CSS_ENDPOINT; 

  const MARKED_BASE_URL = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
  const MARKED_ENDPOINT = '';
  template.markedUrl = MARKED_BASE_URL + MARKED_ENDPOINT;

  const MERMAID_BASE_URL = 'https://cdn.jsdelivr.net/npm/mermaid@9.4.3/dist/mermaid.min.js';
  const MERMAID_ENDPOINT = '';
  template.mermaidUrl = MERMAID_BASE_URL + MERMAID_ENDPOINT;

  // [ACTION_REQUIRED]: Update with your custom favicon image URL (.png or .ico)
  const FAVICON_URL = 'INSERT_FAVICON_URL_HERE';

  return template
    .evaluate()
    .setTitle('Markdown & Mermaid Document Renderer')
    .setFaviconUrl(FAVICON_URL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Fetches content of a markdown file stored in Google Drive by its File ID.
 * @param {string} fileId The Google Drive File ID.
 * @return {string} Markdown text content.
 */
function getMarkdownFromDrive(fileId) {
  try {
    const file = DriveApp.getFileById(fileId);
    return file.getBlob().getDataAsString();
  } catch (error) {
    throw new Error('Unable to read Drive file: ' + error.message);
  }
}

/**
 * Lists subfolders within a given folder or the Drive root folder.
 * @param {string} folderId Optional Google Drive folder ID. Defaults to root.
 * @return {Object} Folder details and list of child folders.
 */
function getDriveFolders(folderId) {
  try {
    let folder;
    const isRoot = (!folderId || folderId.trim() === '' || folderId === 'root');
    if (isRoot) {
      folder = DriveApp.getRootFolder();
    } else {
      folder = DriveApp.getFolderById(folderId.trim());
    }

    const folders = [];
    const iterator = folder.getFolders();
    while (iterator.hasNext()) {
      const f = iterator.next();
      folders.push({
        id: f.getId(),
        name: f.getName()
      });
    }

    folders.sort(function(a, b) {
      return a.name.localeCompare(b.name);
    });

    let parentId = null;
    if (!isRoot) {
      try {
        const parents = folder.getParents();
        if (parents.hasNext()) {
          parentId = parents.next().getId();
        }
      } catch (pErr) {
        console.warn('Could not retrieve parent folder: ' + pErr.message);
      }
    }

    return {
      currentFolderId: folder.getId(),
      currentFolderName: folder.getName(),
      parentId: parentId,
      folders: folders
    };
  } catch (err) {
    throw new Error('Failed to retrieve Drive folders: ' + err.message);
  }
}

/**
 * Creates a Google Doc from processed markdown text and embedded diagram images.
 * Flushes mutations periodically to prevent 'Too many changes applied' errors.
 * @param {string} title Desired title for the new Google Doc.
 * @param {string} folderId Optional Google Drive Folder ID to store the document.
 * @param {string} markdownText Markdown text containing diagram placeholder tokens.
 * @param {Array<string>} diagrams Array of Base64 PNG data URLs for rendered diagrams.
 * @param {Object} tableStyle Styling options for tables (headerBg, headerText, borderColor, altRowBg).
 * @return {string} The URL of the newly created Google Doc.
 */
function exportToGoogleDoc(title, folderId, markdownText, diagrams, tableStyle) {
  try {
    const docTitle = title && title.trim() ? title.trim() : 'Exported Markdown Document';
    let doc = DocumentApp.create(docTitle);
    const docId = doc.getId();
    let body = doc.getBody();

    // Move document to specific Drive folder if specified
    if (folderId && folderId.trim() !== '' && folderId !== 'root') {
      try {
        const file = DriveApp.getFileById(docId);
        const targetFolder = DriveApp.getFolderById(folderId.trim());
        file.moveTo(targetFolder);
      } catch (fErr) {
        console.warn('Could not move file to folder ID ' + folderId + ': ' + fErr.message);
      }
    }

    const style = Object.assign({
      headerBg: '#24292F',
      headerText: '#FFFFFF',
      borderColor: '#D0D7DE',
      altRowBg: '#F6F8FA'
    }, tableStyle || {});

    const textContent = markdownText ? String(markdownText) : '';
    const lines = textContent.split(/\r?\n/);
    
    let inCodeBlock = false;
    let codeBlockBuffer = [];

    let changeCount = 0;
    const BATCH_SIZE = 25;

    function recordChange() {
      changeCount++;
      if (changeCount >= BATCH_SIZE) {
        doc.saveAndClose();
        doc = DocumentApp.openById(docId);
        body = doc.getBody();
        changeCount = 0;
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Handle Code Blocks
      if (line.trim().startsWith('```')) {
        if (inCodeBlock) {
          inCodeBlock = false;
          if (codeBlockBuffer.length > 0) {
            const p = body.appendParagraph(codeBlockBuffer.join('\n'));
            p.setFontFamily('Courier New');
            recordChange();
            codeBlockBuffer = [];
          }
        } else {
          inCodeBlock = true;
          codeBlockBuffer = [];
        }
        continue;
      }

      if (inCodeBlock) {
        codeBlockBuffer.push(line);
        continue;
      }

      // Check for Mermaid diagram placeholder token
      const mermaidMatch = line.trim().match(/^\[\[MERMAID_DIAGRAM_(\d+)\]\]$/);
      if (mermaidMatch) {
        const index = parseInt(mermaidMatch[1], 10);
        if (diagrams && diagrams[index]) {
          try {
            const base64Data = diagrams[index].replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
            const imageBlob = Utilities.newBlob(Utilities.base64Decode(base64Data), 'image/png', 'diagram_' + index + '.png');
            const img = body.appendImage(imageBlob);

            if (img.getWidth() > 500) {
              const ratio = 500 / img.getWidth();
              img.setWidth(500);
              img.setHeight(img.getHeight() * ratio);
            }
            recordChange();
          } catch (imgError) {
            body.appendParagraph('[Diagram Export Error]');
            recordChange();
          }
        }
        continue;
      }

      // Check for Markdown Table
      if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
        const tableRows = [];
        while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
          const rowText = lines[i].trim();
          if (!/^\|[\s\-:|]+\|$/.test(rowText)) {
            const cells = rowText.split('|').slice(1, -1).map(function(c) { return c.trim(); });
            tableRows.push(cells);
          }
          i++;
        }
        i--;

        if (tableRows.length > 0) {
          const table = body.appendTable();
          recordChange();
          if (style.borderColor) {
            table.setBorderColor(style.borderColor);
            table.setBorderWidth(1);
          }

          for (let r = 0; r < tableRows.length; r++) {
            const row = table.appendTableRow();
            const isHeader = (r === 0);

            for (let c = 0; c < tableRows[r].length; c++) {
              const cell = row.appendTableCell();
              recordChange();
              cell.setPaddingTop(6);
              cell.setPaddingBottom(6);
              cell.setPaddingLeft(8);
              cell.setPaddingRight(8);

              if (isHeader) {
                if (style.headerBg) cell.setBackgroundColor(style.headerBg);
                const p = cell.getChild(0).asParagraph();
                p.setHeading(DocumentApp.ParagraphHeading.NORMAL);
                const textStr = tableRows[r][c];
                const txt = p.appendText(textStr);
                txt.setBold(true);
                if (style.headerText) txt.setForegroundColor(style.headerText);
              } else {
                if (r % 2 === 1 && style.altRowBg) {
                  cell.setBackgroundColor(style.altRowBg);
                }
                const p = cell.getChild(0).asParagraph();
                appendFormattedText(p, tableRows[r][c], recordChange);
              }
            }
          }
        }
        continue;
      }

      // Headings
      if (line.startsWith('# ')) {
        const p = body.appendParagraph('');
        appendFormattedText(p, line.substring(2), recordChange);
        p.setHeading(DocumentApp.ParagraphHeading.HEADING1);
        recordChange();
      } else if (line.startsWith('## ')) {
        const p = body.appendParagraph('');
        appendFormattedText(p, line.substring(3), recordChange);
        p.setHeading(DocumentApp.ParagraphHeading.HEADING2);
        recordChange();
      } else if (line.startsWith('### ')) {
        const p = body.appendParagraph('');
        appendFormattedText(p, line.substring(4), recordChange);
        p.setHeading(DocumentApp.ParagraphHeading.HEADING3);
        recordChange();
      } else if (line.startsWith('#### ')) {
        const p = body.appendParagraph('');
        appendFormattedText(p, line.substring(5), recordChange);
        p.setHeading(DocumentApp.ParagraphHeading.HEADING4);
        recordChange();
      } else if (line.startsWith('##### ')) {
        const p = body.appendParagraph('');
        appendFormattedText(p, line.substring(6), recordChange);
        p.setHeading(DocumentApp.ParagraphHeading.HEADING5);
        recordChange();
      } else if (line.startsWith('###### ')) {
        const p = body.appendParagraph('');
        appendFormattedText(p, line.substring(7), recordChange);
        p.setHeading(DocumentApp.ParagraphHeading.HEADING6);
        recordChange();
      } else if (line.trim().startsWith('>')) {
        const p = body.appendParagraph('');
        appendFormattedText(p, line.trim().replace(/^>\s*/, ''), recordChange);
        p.setIndentStart(36);
        p.setItalic(true);
        recordChange();
      } else if (line.trim() === '---' || line.trim() === '***' || line.trim() === '___') {
        body.appendHorizontalRule();
        recordChange();
      } else if (/^\s*[\*\-\+]\s+/.test(line)) {
        const indentLevel = Math.floor(line.search(/\S/) / 2);
        const itemText = line.replace(/^\s*[\*\-\+]\s+/, '');
        const li = body.appendListItem('');
        appendFormattedText(li, itemText, recordChange);
        li.setNestingLevel(indentLevel);
        li.setGlyphType(DocumentApp.GlyphType.BULLET);
        recordChange();
      } else if (/^\s*\d+\.\s+/.test(line)) {
        const indentLevel = Math.floor(line.search(/\S/) / 2);
        const itemText = line.replace(/^\s*\d+\.\s+/, '');
        const li = body.appendListItem('');
        appendFormattedText(li, itemText, recordChange);
        li.setNestingLevel(indentLevel);
        li.setGlyphType(DocumentApp.GlyphType.NUMBER);
        recordChange();
      } else if (line.trim() === '') {
        body.appendParagraph('');
        recordChange();
      } else {
        const p = body.appendParagraph('');
        appendFormattedText(p, line, recordChange);
        recordChange();
      }
    }

    if (inCodeBlock && codeBlockBuffer.length > 0) {
      const p = body.appendParagraph(codeBlockBuffer.join('\n'));
      p.setFontFamily('Courier New');
      recordChange();
    }

    doc.saveAndClose();
    return doc.getUrl();
  } catch (error) {
    throw new Error('Failed to export to Google Doc: ' + error.message);
  }
}

/**
 * Appends inline formatted text (bold, italic, inline code) to a Paragraph or ListItem element.
 * @param {Object} container Paragraph or ListItem element.
 * @param {string} text Markdown text with inline markup.
 * @param {Function} [recordChangeFn] Optional callback to track mutation counts.
 */
function appendFormattedText(container, text, recordChangeFn) {
  if (!text) return;

  const regex = /(\*\*\*[\s\S]+?\*\*\*|\*\*[\s\S]+?\*\*|\*[\s\S]+?\*|`[\s\S]+?`)/g;
  const parts = text.split(regex);

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;

    if (part.startsWith('***') && part.endsWith('***') && part.length > 6) {
      const t = container.appendText(part.slice(3, -3));
      t.setBold(true);
      t.setItalic(true);
    } else if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      const t = container.appendText(part.slice(2, -2));
      t.setBold(true);
    } else if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      const t = container.appendText(part.slice(1, -1));
      t.setItalic(true);
    } else if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      const t = container.appendText(part.slice(1, -1));
      t.setFontFamily('Courier New');
    } else {
      container.appendText(part);
    }

    if (typeof recordChangeFn === 'function') {
      recordChangeFn();
    }
  }
}
