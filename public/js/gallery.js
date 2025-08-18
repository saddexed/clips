// Gallery main page JavaScript
let galleryData = { files: [], stats: { totalFiles: 0, totalSize: 0, videoCount: 0 } };
let currentEditingItem = null;

async function loadGallery() {
    try {
        const response = await fetch('/api/gallery');
        galleryData = await response.json();
        renderGallery();
    } catch (error) {
        console.error('Error loading gallery:', error);
        document.getElementById('loading').innerHTML = 
            '<p>Error loading gallery. Please try again later.</p>';
    }
}

function renderGallery() {
    const loadingEl = document.getElementById('loading');
    const emptyEl = document.getElementById('empty-gallery');
    const gridEl = document.getElementById('gallery-grid');
    loadingEl.style.display = 'none';
    if (galleryData.files.length === 0) {
        emptyEl.style.display = 'block';
        gridEl.style.display = 'none';
        return;
    }

    emptyEl.style.display = 'none';
    gridEl.style.display = 'grid';

    // Render media items without delete functionality
    gridEl.innerHTML = galleryData.files.map(item => {
        const isVideo = item.type === 'video';
        const mediaElement = isVideo 
            ? `<video class="gallery-video" src="${item.discordUrl}" loop></video>`
            : `<img class="gallery-image" src="${item.discordUrl}" alt="${item.title}" loading="lazy">`;
        
        return `
            <div class="gallery-item" onclick="openModal('${item.id}')">
            <div class="image-container">
                ${mediaElement}
                <div class="file-type-badge ${item.type}">${item.type}</div>
                <div class="image-overlay">
                <div class="overlay-content">
                </div>
                </div>
            </div>
            <div class="item-info">
                <div class="item-title">${item.title}</div>
                <div class="item-meta">
                <span class="meta-date">${new Date(item.uploadDate).toLocaleDateString()} ${new Date(item.uploadDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <span class="meta-size">${((item.size || 0) / (1024 * 1024)).toFixed(2)} MB</span>
                </div>
            </div>
            </div>
        `;
    }).join('');

    // Add hover effects for videos
    const videoElements = gridEl.querySelectorAll('.gallery-video');
    videoElements.forEach(video => {
        const item = video.closest('.gallery-item');
        item.addEventListener('mouseenter', () => {
            video.play().catch(() => {});
        });
        item.addEventListener('mouseleave', () => {
            video.pause();
            video.currentTime = 0;
        });
    });
}

function openModal(itemId) {
    const item = galleryData.files.find(img => img.id === itemId);
    if (!item) return;

    currentEditingItem = item;

    const isVideo = item.type === 'video';
    const mediaContainer = document.getElementById('modal-media-container');
    
    if (isVideo) {
        mediaContainer.innerHTML = `<video class="modal-video" src="${item.discordUrl}" controls autoplay loop></video>`;
    } else {
        mediaContainer.innerHTML = `<img class="modal-image" src="${item.discordUrl}" alt="${item.title}">`;
    }

    document.getElementById('modal-title').textContent = item.title;
    document.getElementById('modal-meta').innerHTML = `
        <p><strong>filename:</strong> ${item.originalName}</p>
        <p><strong>date:</strong> ${new Date(item.uploadDate).toLocaleString()}</p>
        <p><strong>size:</strong> ${((item.size || 0) / (1024 * 1024)).toFixed(2)} MB</p>
    `;
    
    document.getElementById('mediaModal').style.display = 'block';
}

function closeModal() {
    const modal = document.getElementById('mediaModal');
    const mediaContainer = document.getElementById('modal-media-container');
    
    // Stop any playing videos
    const video = mediaContainer.querySelector('video');
    if (video) {
        video.pause();
    }
    
    modal.style.display = 'none';
    currentEditingItem = null;
}


function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    const notificationText = document.getElementById('notificationText');
    
    notificationText.textContent = message;
    notification.className = `notification ${type}`;
    notification.classList.add('show');
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}


document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('mediaModal').onclick = function(event) {
        if (event.target === this) {
            closeModal();
        }
    };
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            const mediaModal = document.getElementById('mediaModal');
            
            if (mediaModal.style.display === 'block') {
                closeModal();
            }
        }
    });

    loadGallery();
});