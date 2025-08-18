// Control Panel JavaScript
let galleryData = { files: [], stats: { totalFiles: 0, totalSize: 0, videoCount: 0 } };
let currentEditId = null;
let currentDeleteId = null;

const uploadForm = document.getElementById('uploadForm');
const fileInput = document.getElementById('file');
const fileUploadArea = document.getElementById('fileUploadArea');
const fileInfo = document.getElementById('fileInfo');
const uploadBtn = document.getElementById('uploadBtn');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const statusMessage = document.getElementById('statusMessage');

// File upload area click handler
fileUploadArea.addEventListener('click', () => {
    fileInput.click();
});

// Drag and drop handlers
fileUploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    fileUploadArea.classList.add('dragover');
});

fileUploadArea.addEventListener('dragleave', () => {
    fileUploadArea.classList.remove('dragover');
});

fileUploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    fileUploadArea.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        fileInput.files = files;
        handleFileSelect();
    }
});

// File input change handler
fileInput.addEventListener('change', handleFileSelect);

function getFileType(file) {
    const imageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff'];
    const videoTypes = ['video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/flv', 'video/webm', 'video/mkv', 'video/x-m4v'];
    
    if (imageTypes.includes(file.type) || file.type.startsWith('image/')) {
        return { type: 'image', icon: '🖼️' };
    } else if (videoTypes.includes(file.type) || file.type.startsWith('video/')) {
        return { type: 'video', icon: '🎥' };
    }
    return { type: 'unknown', icon: '📄' };
}

function handleFileSelect() {
    const file = fileInput.files[0];
    if (file) {
        const fileTypeInfo = getFileType(file);
        
        fileUploadArea.classList.add('has-file');
        document.querySelector('.upload-icon').textContent = fileTypeInfo.icon;
        document.querySelector('.upload-text').textContent = `${fileTypeInfo.type.charAt(0).toUpperCase() + fileTypeInfo.type.slice(1)} selected!`;
        
        document.getElementById('fileName').textContent = file.name;
        document.getElementById('fileType').textContent = fileTypeInfo.type.toUpperCase();
        document.getElementById('fileSize').textContent = formatFileSize(file.size);
        fileInfo.classList.add('show');
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message status-${type}`;
    statusMessage.style.display = 'block';
}

function hideStatus() {
    statusMessage.style.display = 'none';
}

// Tab functionality
function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.dataset.tab;
            
            // Remove active class from all tabs and contents
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            // Add active class to clicked tab and corresponding content
            btn.classList.add('active');
            document.getElementById(`${targetTab}-tab`).classList.add('active');
            
            // Load gallery list when manage tab is opened
            if (targetTab === 'manage') {
                loadGalleryList();
            }
        });
    });
}

// Load and display gallery stats
async function loadGalleryStats() {
    try {
        const response = await fetch('/api/gallery');
        galleryData = await response.json();
        
        // Update stats from server-calculated values
        document.getElementById('total-images').textContent = galleryData.stats?.totalFiles || 0;
        document.getElementById('video-count').textContent = galleryData.stats?.videoCount || 0;
        document.getElementById('total-size').textContent = galleryData.stats?.totalSize || '0 MB';
    } catch (error) {
        console.error('Error loading gallery stats:', error);
    }
}

// Load gallery list for management
async function loadGalleryList() {
    try {
        const response = await fetch('/api/gallery');
        galleryData = await response.json();
        renderGalleryList(galleryData.files);
    } catch (error) {
        console.error('Error loading gallery list:', error);
        document.getElementById('galleryList').innerHTML = 
            '<p class="error-message">Error loading gallery. Please try again.</p>';
    }
}

// Render gallery list
function renderGalleryList(items) {
    const galleryList = document.getElementById('galleryList');
    
    if (items.length === 0) {
        galleryList.innerHTML = '<p class="empty-message">No media files found.</p>';
        return;
    }
    
    galleryList.innerHTML = items.map(item => {
        const isVideo = item.type === 'video';
        return `
            <div class="gallery-list-item">
                <div class="item-thumbnail">
                    ${isVideo 
                        ? `<video class="list-video" src="${item.discordUrl}" muted></video>`
                        : `<img class="list-image" src="${item.discordUrl}" alt="${item.title}">`
                    }
                    <div class="item-type-badge ${item.type}">${item.type}</div>
                </div>
                <div class="item-details">
                    <div class="item-title-large">${item.title}</div>
                    <div class="item-meta-details">
                        <span><strong>Original:</strong> ${item.originalName}</span>
                        <span><strong>Size:</strong> ${((item.size || 0) / (1024 * 1024)).toFixed(2)} MB</span>
                        <span><strong>Uploaded:</strong> ${new Date(item.uploadDate).toLocaleDateString()}</span>
                    </div>
                </div>
                <div class="item-actions">
                    <button class="btn-edit" onclick="openEditModal('${item.id}')">
                        ✏️ Edit
                    </button>
                    <button class="btn-delete" onclick="openDeleteModal('${item.id}')">
                        🗑️ Delete
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// Search functionality
function initSearch() {
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filteredItems = galleryData.files.filter(item => 
            item.title.toLowerCase().includes(searchTerm) ||
            item.originalName.toLowerCase().includes(searchTerm)
        );
        renderGalleryList(filteredItems);
    });
}

// Edit functionality
function openEditModal(itemId) {
    const item = galleryData.files.find(img => img.id === itemId);
    if (!item) return;
    
    currentEditId = itemId;
    document.getElementById('editTitle').value = item.title;
    document.getElementById('editModal').style.display = 'block';
}

function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
    currentEditId = null;
}

async function saveEdit() {
    if (!currentEditId) return;
    
    const newTitle = document.getElementById('editTitle').value.trim();
    if (!newTitle) {
        showStatus('Title cannot be empty', 'error');
        return;
    }
    
    try {
        const response = await fetch(`/api/gallery/${currentEditId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ title: newTitle })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showStatus('Media updated successfully', 'success');
            closeEditModal();
            loadGalleryList();
            loadGalleryStats();
        } else {
            showStatus(result.error || 'Update failed', 'error');
        }
    } catch (error) {
        showStatus('Update failed: ' + error.message, 'error');
    }
}

// Delete functionality
function openDeleteModal(itemId) {
    const item = galleryData.files.find(img => img.id === itemId);
    if (!item) return;
    
    currentDeleteId = itemId;
    document.getElementById('deleteItemTitle').textContent = item.title;
    document.getElementById('deleteModal').style.display = 'block';
}

function closeDeleteModal() {
    document.getElementById('deleteModal').style.display = 'none';
    currentDeleteId = null;
}

async function confirmDelete() {
    if (!currentDeleteId) return;
    
    try {
        const response = await fetch(`/api/gallery/${currentDeleteId}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showStatus('Media deleted successfully', 'success');
            closeDeleteModal();
            loadGalleryList();
            loadGalleryStats();
        } else {
            showStatus(result.error || 'Delete failed', 'error');
        }
    } catch (error) {
        showStatus('Delete failed: ' + error.message, 'error');
    }
}

// Form submission
uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData();
    const file = fileInput.files[0];
    const title = document.getElementById('title').value.trim();

    if (!file) {
        showStatus('Please select a media file', 'error');
        return;
    }

    formData.append('file', file);
    if (title) {
        formData.append('title', title);
    }

    // Update UI
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Uploading...';
    progressBar.style.display = 'block';
    hideStatus();

    try {
        // Simulate progress (since we can't track real progress easily)
        let progress = 0;
        const progressInterval = setInterval(() => {
            progress += Math.random() * 25;
            if (progress > 90) progress = 90;
            progressFill.style.width = progress + '%';
        }, 300);

        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        clearInterval(progressInterval);
        progressFill.style.width = '100%';

        const result = await response.json();

        if (response.ok) {
            showStatus(result.message || 'Media uploaded successfully!', 'success');
            uploadForm.reset();
            fileUploadArea.classList.remove('has-file');
            document.querySelector('.upload-icon').textContent = '📁';
            document.querySelector('.upload-text').textContent = 'Click to select media or drag and drop';
            fileInfo.classList.remove('show');
            loadGalleryStats(); // Update stats after upload
        } else {
            showStatus(result.error || 'Upload failed', 'error');
        }
    } catch (error) {
        showStatus('Upload failed: ' + error.message, 'error');
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = 'Upload to Gallery';
        setTimeout(() => {
            progressBar.style.display = 'none';
            progressFill.style.width = '0%';
        }, 1000);
    }
});

// Initialize everything on page load
document.addEventListener('DOMContentLoaded', function() {
    initTabs();
    initSearch();
    loadGalleryStats();
    
    // Edit modal event listeners
    document.getElementById('editModalClose').onclick = closeEditModal;
    document.getElementById('cancelEdit').onclick = closeEditModal;
    document.getElementById('editForm').onsubmit = (e) => {
        e.preventDefault();
        saveEdit();
    };
    
    // Delete modal event listeners
    document.getElementById('cancelDelete').onclick = closeDeleteModal;
    document.getElementById('confirmDelete').onclick = confirmDelete;
    
    // Modal click outside to close
    document.getElementById('editModal').onclick = function(event) {
        if (event.target === this) closeEditModal();
    };
    
    document.getElementById('deleteModal').onclick = function(event) {
        if (event.target === this) closeDeleteModal();
    };
    
    // Keyboard shortcuts
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            closeEditModal();
            closeDeleteModal();
        }
    });
});