const editor = document.querySelector(".editor");
const preview = document.querySelector(".preview");
const fileInput = document.getElementById("fileInput");
const filenameInput = document.getElementById("filename");
const documentsList = document.getElementById("documentsList");

let currentDocId = null;

// Set up marked options
marked.setOptions({
    breaks: true,
    gfm: true,
    headerIds: false,
});

// Get all documents from localStorage
function getAllDocuments() {
    const docs = {};
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith("doc:")) {
            try {
                docs[key] = JSON.parse(localStorage.getItem(key));
            } catch (e) {
                console.error("Error parsing document:", key);
            }
        }
    }
    return docs;
}

// Update documents list
function updateDocumentsList() {
    const docs = getAllDocuments();
    documentsList.innerHTML = "";

    // Convert to array and sort by lastModified timestamp (newest first)
    const sortedDocs = Object.entries(docs)
        .sort(([, a], [, b]) => b.lastModified - a.lastModified);

    sortedDocs.forEach(([key, doc]) => {
        const div = document.createElement("div");
        div.className = "document-item" + (key === currentDocId ? " active" : "");
        div.innerHTML = `
            <span>${doc.filename}</span>
            <button class="delete-btn" onclick="deleteDocument('${key}', event)">×</button>
        `;
        div.addEventListener("click", () => loadDocument(key));
        documentsList.appendChild(div);
    });
}

// Save current document
function saveDocument() {
    const content = editor.value;
    const filename = filenameInput.value.trim();

    if (!filename) {
        alert("Please enter a filename");
        filenameInput.focus();
        return;
    }

    const docId = currentDocId || "doc:" + Date.now();
    const doc = {
        filename: filename.endsWith(".md") ? filename : filename + ".md",
        content: content,
        lastModified: Date.now(),
    };

    localStorage.setItem(docId, JSON.stringify(doc));
    currentDocId = docId;
    updateDocumentsList();
    updateBacklinks();

}

// Load document
function loadDocument(docId) {
    const doc = JSON.parse(localStorage.getItem(docId));
    if (doc) {
        editor.value = doc.content;
        filenameInput.value = doc.filename;
        currentDocId = docId;
        updatePreview();
        updateDocumentsList();
        updateBacklinks(); // Add this line

    }
}

// Delete document
function deleteDocument(docId, event) {
    event.stopPropagation();
    if (confirm("Are you sure you want to delete this document?")) {
        localStorage.removeItem(docId);

        if (currentDocId === docId) {
            // Get sorted list of remaining documents
            const docs = getAllDocuments();
            const sortedDocs = Object.entries(docs)
                .sort(([, a], [, b]) => b.lastModified - a.lastModified);

            if (sortedDocs.length > 0) {
                // Load the first document from the sorted list
                loadDocument(sortedDocs[0][0]);
            } else {
                // Only create new if there are no documents left
                createNew();
            }
        }

        updateDocumentsList();
    }
}

// Create new document
function createNew() {
    editor.value = "";
    filenameInput.value = "document.md";
    currentDocId = null;
    updatePreview();
    updateDocumentsList();
    updateBacklinks();

}

// Add debounce function at the top with other utilities
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// Add this function to find backlinks
function findBacklinks(filename) {
    const docs = getAllDocuments();
    return Object.entries(docs)
        .filter(([_, doc]) => {
            // Look for [[filename]] pattern in the content
            const linkPattern = new RegExp(`\\[\\[${filename.replace(/\.md$/, '')}\\]\\]`, 'i');
            return linkPattern.test(doc.content);
        })
        .map(([key, doc]) => ({
            id: key,
            filename: doc.filename
        }));
}

// Add this function to update the backlinks display
function updateBacklinks() {
    if (!currentDocId) return;

    const currentDoc = JSON.parse(localStorage.getItem(currentDocId));
    if (!currentDoc) return;

    const backlinks = findBacklinks(currentDoc.filename);

    // Create or get backlinks container
    let backlinksContainer = document.getElementById('backlinks');
    if (!backlinksContainer) {
        backlinksContainer = document.createElement('div');
        backlinksContainer.id = 'backlinks';
        documentsList.parentNode.appendChild(backlinksContainer);
    }

    // Update backlinks content
    if (backlinks.length > 0) {
        backlinksContainer.innerHTML = `
            <h3>Backlinks</h3>
            <div class="backlinks-list">
                ${backlinks.map(link => `
                    <div class="backlink-item" onclick="loadDocument('${link.id}')">
                        ${link.filename}
                    </div>
                `).join('')}
            </div>
        `;
    } else {
        backlinksContainer.innerHTML = '';
    }
}

// Add autosave function
const autoSave = debounce(() => {
    if (filenameInput.value.trim()) {
        saveDocument();
    }
}, 100); // Will save .1 second after last change

// Modify the updatePreview function to include autosave
function updatePreview() {
    let markdown = editor.value;

    // Replace [[filename]] with links before parsing markdown
    markdown = markdown.replace(/\[\[(.*?)\]\]/g, (match, filename) => {
        const cleanName = filename.trim();
        const fullName = cleanName.endsWith('.md') ? cleanName : cleanName + '.md';

        const exists = Object.values(getAllDocuments())
            .some(doc => doc.filename.toLowerCase() === fullName.toLowerCase());

        const className = exists ? 'internal-link' : 'internal-link broken';
        return `<a href="#" class="${className}" data-filename="${fullName}">${filename}</a>`;
    });

    const html = marked.parse(markdown);
    preview.innerHTML = html;

    // Add click handlers to internal links
    preview.querySelectorAll('.internal-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetFile = link.getAttribute('data-filename');
            openLinkedDocument(targetFile);
        });
    });

    // Trigger autosave
    autoSave();
}

// Add this new function to handle opening linked documents
function openLinkedDocument(filename) {
    const docs = getAllDocuments();
    const docEntry = Object.entries(docs).find(([_, doc]) =>
        doc.filename.toLowerCase() === filename.toLowerCase()
    );

    if (docEntry) {
        loadDocument(docEntry[0]);
    } else {
        // Create new document if it doesn't exist
        createNew();
        filenameInput.value = filename;
        editor.focus();
    }
}

// Import file
function loadFile() {
    fileInput.click();
}

// Handle file selection
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        editor.value = e.target.result;
        filenameInput.value = file.name;
        currentDocId = null;
        updatePreview();
        updateDocumentsList();
    };
    reader.readAsText(file);
}

// Add this new function
function downloadMarkdown() {
    const content = editor.value;
    const filename = filenameInput.value.trim() || 'document.md';

    // Create a blob with the markdown content
    const blob = new Blob([content], { type: 'text/markdown' });

    // Create a temporary link element
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;

    // Programmatically click the link to trigger download
    document.body.appendChild(link);
    link.click();

    // Clean up
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}

// Add this new function to create a secret gist
async function createGist() {
    const content = editor.value;
    const filename = filenameInput.value.trim() || 'document.md';

    // Get GitHub token from localStorage or prompt user
    let githubToken = localStorage.getItem('githubToken');
    if (!githubToken) {
        githubToken = prompt('Please enter your GitHub Personal Access Token:');
        if (!githubToken) return;

        // Save token for future use
        if (confirm('Would you like to save this token for future use?')) {
            localStorage.setItem('githubToken', githubToken);
        }
    }

    try {
        const response = await fetch('https://api.github.com/gists', {
            method: 'POST',
            headers: {
                'Authorization': `token ${githubToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                description: 'Created from Markdown Editor',
                public: false,
                files: {
                    [filename]: {
                        content: content
                    }
                }
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        // Copy gist URL to clipboard
        await navigator.clipboard.writeText(data.html_url);
        alert(`Gist created successfully!\nURL copied to clipboard: ${data.html_url}`);

    } catch (error) {
        console.error('Error creating gist:', error);
        alert('Error creating gist. Please check your GitHub token and try again.');
        localStorage.removeItem('githubToken'); // Clear potentially invalid token
    }
}

// Initial setup
updatePreview();
updateDocumentsList();

// Handle Enter key in filename input
filenameInput.addEventListener("keypress", function (event) {
    if (event.key === "Enter") {
        saveDocument();
    }
}); 