# Markdown & Mermaid to Google Docs Exporter

This Google Apps Script application seamlessly converts Markdown content with embedded Mermaid diagrams into rendered HTML, allowing you to easily print to PDF or export directly into fully formatted Google Docs.

## 📁 File Structure

* `Code.gs`: Contains server-side handlers for Drive queries, folder tree browsing, and Google Doc generation.
* `Index.html`: Contains the web app user interface, styling, Markdown parser, and Mermaid SVG renderer.

---

## ⚙️ Setup & Deployment

### 3. Authorize Permissions
1. In the Apps Script editor, select `exportToGoogleDoc` from the function dropdown menu at the top toolbar.
2. Click **Run**.
3. When prompted with **Authorization Required**, click **Review Permissions** and grant access to your Google Account.

### 4. Deploy as a Web App
1. At the top right, click **Deploy** > **New deployment**.
2. Select **Web app** as the deployment type.
3. Configure settings:
   * **Execute as:** User deploying the web app
   * **Who has access:** Anyone within your organization or Anyone
4. Click **Deploy** and copy your Web App deployment URL.

---

## 💻 Usage Instructions

1. Open the Web App URL in your browser.
2. **Load Markdown Content:**
   * Enter a Google Drive File ID into the toolbar input and click **Load Drive File**, OR
   * Paste Markdown text directly into the textarea and click **Render Document**.
3. **Print / Export PDF:**
   * Click **Print / Save PDF** to trigger browser print dialog formatted for document printing.
4. **Export to Google Doc:**
   * Click **Export to Google Doc**.
   * Enter a document title, navigate your Drive folders using the interactive picker, and set table styling preferences.
   * Click **Confirm Export** to create the document and open it directly.

---

## 🛠️ Built With

* **Google Apps Script**
* **marked.js** — Client-side Markdown rendering.
* **Mermaid.js (v9.4.3)** — Diagram rendering.
