import React, { useState, useRef, useEffect } from 'react';
import {
  SidebarToggleIcon,
  UploadCloudIcon,
  FilePdfIcon,
  FilePptIcon,
  BookOpenIcon,
  FolderIcon,
  FolderOpenIcon,
  ArrowLeftIcon,
  DownloadIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  EyeIcon,
} from './Icons';
import type { NotebookItem, NotebookFile } from '../types/notebook';
import { DocumentViewerModal } from './DocumentViewerModal';
import {
  subscribeToNotebooks,
  createNotebook,
  deleteNotebook,
  uploadFileToNotebook,
  deleteFileFromNotebook,
} from '../services/notebookService';

interface NotebooksViewProps {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  isRightSidebarOpen?: boolean;
  onToggleRightSidebar?: () => void;
  username?: string;
  onStartChatWithNotebook?: (prompt: string) => void;
  onOpenDocumentViewer?: (file: NotebookFile) => void;
}

// Blue-toned spine gradients for book / folder covers
const BOOK_GRADIENTS = [
  'linear-gradient(180deg, #3b82f6 0%, #1d4ed8 100%)', // Blue
  'linear-gradient(180deg, #6366f1 0%, #4338ca 100%)', // Indigo
  'linear-gradient(180deg, #8b5cf6 0%, #6d28d9 100%)', // Violet
  'linear-gradient(180deg, #06b6d4 0%, #0891b2 100%)', // Cyan
  'linear-gradient(180deg, #0ea5e9 0%, #0369a1 100%)', // Sky
  'linear-gradient(180deg, #a78bfa 0%, #7c3aed 100%)', // Purple
];

export const NotebooksView: React.FC<NotebooksViewProps> = ({
  isSidebarOpen,
  onToggleSidebar,
  isRightSidebarOpen = true,
  onToggleRightSidebar,
  username = 'default',
  onStartChatWithNotebook: _onStartChatWithNotebook,
  onOpenDocumentViewer,
}) => {
  const [notebooks, setNotebooks] = useState<NotebookItem[]>([]);
  const [openedNotebookId, setOpenedNotebookId] = useState<string | null>(null);
  const [activeViewingFile, setActiveViewingFile] = useState<NotebookFile | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'empty' | 'has_files'>('all');

  // Modals & Forms
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Uploading state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatusMsg, setUploadStatusMsg] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Target notebook for direct card upload
  const [uploadTargetNotebookId, setUploadTargetNotebookId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Subscribe in real-time to user's notebooks in Firebase Firestore
  useEffect(() => {
    if (!username) return;
    const unsubscribe = subscribeToNotebooks(username, (userNotebooks) => {
      setNotebooks(userNotebooks);
    });
    return () => unsubscribe();
  }, [username]);

  // Active opened notebook (if in folder view)
  const activeNotebook = notebooks.find((nb) => nb.id === openedNotebookId) || null;

  // Handler to create a new notebook in Firebase
  const handleCreateNotebook = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const title = newTitle.trim();
    if (!title || isCreating) return;

    setIsCreating(true);
    try {
      const gradient = BOOK_GRADIENTS[notebooks.length % BOOK_GRADIENTS.length];
      const created = await createNotebook(username, title, newDesc, gradient);
      setNewTitle('');
      setNewDesc('');
      setShowCreateModal(false);
      setUploadStatusMsg(`Created notebook "${created.title}" in Firebase!`);
      setTimeout(() => setUploadStatusMsg(null), 3500);
    } catch (err) {
      console.error('Failed to create notebook:', err);
    } finally {
      setIsCreating(false);
    }
  };

  // Handler to trigger file upload for a specific notebook
  const triggerUploadForNotebook = (notebookId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setUploadTargetNotebookId(notebookId);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  // Process files uploaded to a notebook (uploaded to Firebase Storage & Firestore)
  const handleFilesSelected = async (files: FileList | null) => {
    const targetId = uploadTargetNotebookId || openedNotebookId;
    if (!files || files.length === 0 || !targetId) return;

    const targetNb = notebooks.find((nb) => nb.id === targetId);
    const targetName = targetNb ? targetNb.title : 'notebook';

    setIsUploading(true);
    setUploadStatusMsg(`Uploading ${files.length} document(s) to "${targetName}" in Firebase...`);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        await uploadFileToNotebook(username, targetId, file);
      }
      setUploadStatusMsg(`Successfully uploaded to "${targetName}" in Firebase!`);
    } catch (err) {
      console.error('Failed uploading files to notebook:', err);
      setUploadStatusMsg('Upload finished with local sync.');
    } finally {
      setIsUploading(false);
      setUploadTargetNotebookId(null);
      setTimeout(() => setUploadStatusMsg(null), 4000);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && (openedNotebookId || uploadTargetNotebookId)) {
      handleFilesSelected(e.dataTransfer.files);
    }
  };

  // Handler to delete a notebook
  const handleDeleteNotebook = async (notebookId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const nb = notebooks.find((n) => n.id === notebookId);
    const confirmDelete = window.confirm(`Are you sure you want to delete the notebook "${nb?.title || 'Notebook'}" and its files?`);
    if (!confirmDelete) return;

    try {
      await deleteNotebook(username, notebookId);
      if (openedNotebookId === notebookId) {
        setOpenedNotebookId(null);
      }
      setUploadStatusMsg('Notebook deleted from Firebase.');
      setTimeout(() => setUploadStatusMsg(null), 3000);
    } catch (err) {
      console.error('Failed to delete notebook:', err);
    }
  };

  // Handler to delete a single file inside a notebook
  const handleDeleteFile = async (notebookId: string, fileId: string, fileName: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const confirmDelete = window.confirm(`Remove "${fileName}" from this notebook?`);
    if (!confirmDelete) return;

    try {
      await deleteFileFromNotebook(username, notebookId, fileId);
      setUploadStatusMsg(`Removed "${fileName}" from Firebase.`);
      setTimeout(() => setUploadStatusMsg(null), 3000);
    } catch (err) {
      console.error('Failed to delete file:', err);
    }
  };

  // Filter notebooks for the grid
  const filteredNotebooks = notebooks.filter((nb) => {
    const matchesSearch =
      !searchQuery.trim() ||
      nb.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (nb.description && nb.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      nb.files.some((f) => f.name.toLowerCase().includes(searchQuery.toLowerCase()));

    const fileCount = nb.files ? nb.files.length : 0;
    const matchesFilter =
      filterType === 'all' ||
      (filterType === 'empty' && fileCount === 0) ||
      (filterType === 'has_files' && fileCount > 0);

    return matchesSearch && matchesFilter;
  });

  return (
    <main style={styles.container}>
      {/* Hidden file input for uploading real PDFs and PPTs directly into notebook */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.ppt,.pptx,.txt,.doc,.docx"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => handleFilesSelected(e.target.files)}
      />

      {/* Top Header Bar with Sidebar Controls */}
      <header style={styles.topBar}>
        <div style={styles.topBarLeft}>
          {!isSidebarOpen && (
            <button
              onClick={onToggleSidebar}
              style={styles.sidebarOpenBtn}
              title="Open left sidebar"
              aria-label="Open left sidebar"
            >
              <SidebarToggleIcon size={18} />
            </button>
          )}

          {activeNotebook && (
            <button
              onClick={() => setOpenedNotebookId(null)}
              style={styles.backButton}
              title="Back to all notebooks"
            >
              <ArrowLeftIcon size={16} />
              <span>All Notebooks</span>
            </button>
          )}
        </div>

        <div style={styles.topBarCenter}>
          <div style={styles.navPill}>
            <FolderIcon size={14} />
            <span>
              {activeNotebook ? `Notebooks / ${activeNotebook.title}` : 'Notebooks & Study Folders'}
            </span>
          </div>
        </div>

        <div style={styles.topBarRight}>
          {!isRightSidebarOpen && onToggleRightSidebar && (
            <button
              onClick={onToggleRightSidebar}
              style={styles.sidebarOpenBtn}
              title="Open right sidebar"
              aria-label="Open right sidebar"
            >
              <SidebarToggleIcon size={18} />
            </button>
          )}
        </div>
      </header>

      {/* Notification Toast */}
      {uploadStatusMsg && (
        <div style={styles.notificationToast}>
          <span>✓</span>
          <span>{uploadStatusMsg}</span>
        </div>
      )}

      {/* Content Area */}
      <div style={styles.scrollArea}>
        {/* ========================================================
            VIEW 1: INSIDE NOTEBOOK FOLDER VIEW
           ======================================================== */}
        {activeNotebook ? (
          <div style={styles.folderContentWrapper}>
            {/* Folder Header */}
            <div style={styles.folderHeaderCard}>
              <div
                style={{
                  ...styles.folderSpineAccent,
                  background: activeNotebook.coverColor,
                }}
              />
              <div style={styles.folderHeaderDetails}>
                <div style={styles.folderTopRow}>
                  <div style={styles.folderBadge}>
                    <FolderOpenIcon size={14} />
                    <span>STUDY FOLDER</span>
                  </div>
                  <span style={styles.fileCountPill}>
                    {activeNotebook.files.length} document{activeNotebook.files.length === 1 ? '' : 's'}
                  </span>
                </div>

                <h1 style={styles.folderTitle}>{activeNotebook.title}</h1>
                <p style={styles.folderDesc}>
                  {activeNotebook.description ||
                    'Upload your lecture slides, textbooks, and notes to study and ask questions directly with Rad AI.'}
                </p>

                {/* Header Actions */}
                <div style={styles.folderHeaderActions}>
                  <button
                    onClick={() => triggerUploadForNotebook(activeNotebook.id)}
                    style={styles.folderUploadBtn}
                    disabled={isUploading}
                  >
                    <UploadCloudIcon size={16} />
                    <span>{isUploading ? 'Uploading to Firebase...' : 'Upload PDF / PPT'}</span>
                  </button>

                  <button
                    onClick={() => handleDeleteNotebook(activeNotebook.id)}
                    style={styles.folderDeleteBtn}
                    title="Delete notebook"
                  >
                    <TrashIcon size={15} />
                    <span>Delete Notebook</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Upload Drag & Drop Zone inside the folder */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => triggerUploadForNotebook(activeNotebook.id)}
              style={{
                ...styles.folderDropZone,
                borderColor: isDragOver ? 'var(--accent-terracotta)' : 'rgba(255,255,255,0.1)',
                backgroundColor: isDragOver ? 'rgba(255,255,255,0.05)' : '#000000',
              }}
            >
              <div style={styles.folderDropIcon}>
                <UploadCloudIcon size={32} />
              </div>
              <h3 style={styles.folderDropTitle}>
                {isDragOver ? 'Drop files here to upload' : `Upload files to "${activeNotebook.title}"`}
              </h3>
              <p style={styles.folderDropDesc}>
                Drag & drop course PDFs or PPT presentations here, or click to browse files.
              </p>
              <div style={styles.supportedBadgeGroup}>
                <span style={styles.docBadge}>.PDF</span>
                <span style={styles.docBadge}>.PPT</span>
                <span style={styles.docBadge}>.PPTX</span>
                <span style={styles.docBadge}>.DOCX</span>
                <span style={styles.docBadge}>.TXT</span>
              </div>
            </div>

            {/* Files List inside this Notebook */}
            <div style={styles.filesSection}>
              <h2 style={styles.filesSectionTitle}>
                Uploaded Documents ({activeNotebook.files.length})
              </h2>

              {activeNotebook.files.length === 0 ? (
                <div style={styles.emptyFolderBox}>
                  <FolderOpenIcon size={36} />
                  <h4 style={styles.emptyFolderTitle}>No documents yet in this notebook</h4>
                  <p style={styles.emptyFolderDesc}>
                    Click the upload button above to add your lecture PDFs, PowerPoint decks, or syllabus to start asking questions with Rad AI.
                  </p>
                </div>
              ) : (
                <div style={styles.filesGrid}>
                  {activeNotebook.files.map((file) => {
                    const isPdf = file.type === 'pdf';
                    const isPpt = file.type === 'ppt' || file.type === 'pptx';

                    return (
                      <div
                        key={file.id}
                        onClick={() => {
                          if (onOpenDocumentViewer) {
                            onOpenDocumentViewer(file);
                          } else {
                            setActiveViewingFile(file);
                          }
                        }}
                        style={{ ...styles.fileCard, cursor: 'pointer' }}
                        title={`Click to view "${file.name}" in floating window`}
                      >
                        <div style={styles.fileCardTop}>
                          <div
                            style={{
                              ...styles.fileTypeBadge,
                              backgroundColor: isPdf ? 'rgba(239, 68, 68, 0.15)' : isPpt ? 'rgba(249, 115, 22, 0.15)' : 'rgba(168, 85, 247, 0.15)',
                              color: isPdf ? '#f87171' : isPpt ? '#fb923c' : '#c084fc',
                            }}
                          >
                            {isPdf ? <FilePdfIcon size={16} /> : isPpt ? <FilePptIcon size={16} /> : <BookOpenIcon size={16} />}
                            <span>{file.type.toUpperCase()}</span>
                          </div>

                          <button
                            onClick={(e) => handleDeleteFile(activeNotebook.id, file.id, file.name, e)}
                            style={styles.fileDeleteBtn}
                            title="Delete file"
                          >
                            <TrashIcon size={14} />
                          </button>
                        </div>

                        <h3 style={styles.fileName} title={file.name}>
                          {file.name}
                        </h3>

                        <div style={styles.fileMetaRow}>
                          <span>{file.size}</span>
                          {file.pageCount && <span>• {file.pageCount}</span>}
                          <span>• {new Date(file.uploadedAt).toLocaleDateString()}</span>
                        </div>

                        <div style={styles.fileActionsRow}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onOpenDocumentViewer) {
                                onOpenDocumentViewer(file);
                              } else {
                                setActiveViewingFile(file);
                              }
                            }}
                            style={styles.fileViewBtn}
                            title="Open floating document window beside chat"
                          >
                            <EyeIcon size={14} />
                            <span>View Document</span>
                          </button>

                          {file.downloadUrl && (
                            <a
                              href={file.downloadUrl}
                              download={file.name}
                              target="_blank"
                              rel="noreferrer"
                              style={styles.fileDownloadBtn}
                              title="Download document"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <DownloadIcon size={14} />
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ========================================================
             VIEW 2: MAIN NOTEBOOKS GRID (ONLY CREATE CARD + NOTEBOOKS)
             ======================================================== */
          <div style={styles.contentWrapper}>
            {/* Hero Section */}
            <div style={styles.heroSection}>
              <div style={styles.heroIconBadge}>
                <BookOpenIcon size={24} />
              </div>
              <h1 style={styles.heroTitle}>Notebooks & Study Folders</h1>
              <p style={styles.heroSubtitle}>
                Create notebooks to organize course materials. Each notebook acts as a folder where you can upload and study PDFs, PPT presentations, and notes with Rad AI.
              </p>
            </div>

            {/* Search and Controls Bar */}
            <div style={styles.controlsBar}>
              <div style={styles.searchBox}>
                <SearchIcon size={15} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search notebooks or files inside..."
                  style={styles.searchInput}
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} style={styles.clearBtn}>
                    ✕
                  </button>
                )}
              </div>

              {/* Filter Pills */}
              <div style={styles.filterPillsGroup}>
                {(['all', 'has_files', 'empty'] as const).map((ft) => {
                  const isSelected = filterType === ft;
                  const labels: Record<string, string> = {
                    all: 'All Notebooks',
                    has_files: 'With Files',
                    empty: 'Empty Folders',
                  };
                  return (
                    <button
                      key={ft}
                      onClick={() => setFilterType(ft)}
                      style={{
                        ...styles.filterPill,
                        backgroundColor: isSelected ? 'rgba(255,255,255,0.08)' : 'transparent',
                        color: isSelected ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)',
                        borderColor: isSelected ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)',
                      }}
                    >
                      {labels[ft]}
                    </button>
                  );
                })}
              </div>

              {/* New Notebook Button */}
              <button
                onClick={() => setShowCreateModal(true)}
                style={styles.newNotebookTopBtn}
              >
                <PlusIcon size={15} />
                <span>New Notebook</span>
              </button>
            </div>

            {/* Cards Grid: ONLY "+ Create Notebook" card + Notebook folder cards */}
            <div style={styles.cardsGrid}>
              {/* Card 1: "+ Create Notebook" Card */}
              <div
                onClick={() => setShowCreateModal(true)}
                style={styles.createNotebookCard}
                title="Create a new study notebook"
              >
                <div style={styles.createCardSpine} />
                <div style={styles.createCardBody}>
                  <div style={styles.createCardIconWrapper}>
                    <PlusIcon size={26} />
                  </div>
                  <h3 style={styles.createCardTitle}>Create Notebook</h3>
                  <p style={styles.createCardDesc}>
                    Create a new folder for your course, subject, or lab to upload and organize lecture documents.
                  </p>
                  <div style={styles.createCardActionBadge}>
                    <PlusIcon size={13} />
                    <span>+ New Notebook</span>
                  </div>
                </div>
              </div>

              {/* Notebook Folder Cards */}
              {filteredNotebooks.map((nb) => {
                const fileCount = nb.files ? nb.files.length : 0;
                const pdfCount = nb.files ? nb.files.filter((f) => f.type === 'pdf').length : 0;
                const pptCount = nb.files ? nb.files.filter((f) => f.type === 'ppt' || f.type === 'pptx').length : 0;

                let fileSubtitle = 'Empty · Ready for uploads';
                if (fileCount > 0) {
                  const parts: string[] = [];
                  if (pdfCount > 0) parts.push(`${pdfCount} PDF${pdfCount > 1 ? 's' : ''}`);
                  if (pptCount > 0) parts.push(`${pptCount} PPT${pptCount > 1 ? 's' : ''}`);
                  const others = fileCount - pdfCount - pptCount;
                  if (others > 0) parts.push(`${others} doc${others > 1 ? 's' : ''}`);
                  fileSubtitle = parts.join(', ');
                }

                return (
                  <div
                    key={nb.id}
                    onClick={() => setOpenedNotebookId(nb.id)}
                    style={styles.notebookFolderCard}
                    title={`Open "${nb.title}" folder`}
                  >
                    {/* Realistic 3D Spine */}
                    <div
                      style={{
                        ...styles.bookSpine,
                        background: nb.coverColor,
                      }}
                    />

                    {/* Card Inner Content */}
                    <div style={styles.cardContent}>
                      {/* Top Row: Folder Badge & Delete Action */}
                      <div style={styles.cardTopRow}>
                        <div style={styles.folderBadgePill}>
                          <FolderIcon size={12} />
                          <span>FOLDER</span>
                        </div>

                        <button
                          onClick={(e) => handleDeleteNotebook(nb.id, e)}
                          style={styles.cardDeleteBtn}
                          title="Delete notebook"
                        >
                          <TrashIcon size={14} />
                        </button>
                      </div>

                      {/* Icon & Title */}
                      <div style={styles.cardHeaderArea}>
                        <div style={styles.folderCardIcon}>
                          <BookOpenIcon size={22} />
                        </div>
                        <h3 style={styles.cardTitle}>{nb.title}</h3>
                        <p style={styles.cardDesc}>
                          {nb.description || `Study folder for ${nb.title}. Open to view, upload, and study documents with Rad AI.`}
                        </p>
                      </div>

                      {/* File Count & Meta */}
                      <div style={styles.cardMetaBox}>
                        <span style={styles.cardFileCount}>
                          {fileCount} {fileCount === 1 ? 'file' : 'files'}
                        </span>
                        <span style={styles.cardFileBreakdown}>{fileSubtitle}</span>
                      </div>

                      {/* Card Action Buttons: "+ Upload" directly into notebook & "Open Folder" */}
                      <div style={styles.cardActionsRow}>
                        <button
                          onClick={(e) => triggerUploadForNotebook(nb.id, e)}
                          style={styles.cardUploadBtn}
                          title="Upload PDF or PPT into this notebook"
                        >
                          <UploadCloudIcon size={13} />
                          <span>+ Upload</span>
                        </button>

                        <button
                          onClick={() => setOpenedNotebookId(nb.id)}
                          style={styles.cardOpenBtn}
                        >
                          <span>Open</span>
                          <span>→</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ========================================================
          CREATE NOTEBOOK MODAL
         ======================================================== */}
      {showCreateModal && (
        <div style={styles.modalOverlay} onClick={() => setShowCreateModal(false)}>
          <div style={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div style={styles.modalTitleGroup}>
                <div style={styles.modalIconWrap}>
                  <BookOpenIcon size={18} />
                </div>
                <h3 style={styles.modalHeading}>Create New Notebook</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                style={styles.modalCloseBtn}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateNotebook} style={styles.modalBody}>
              <p style={styles.modalSubheading}>
                Enter a title for your study notebook (e.g. <em>MCBC</em>, <em>Microprocessors</em>, <em>Control Systems</em>). Once created, you can upload PDFs and PPTs directly into it.
              </p>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Notebook Title</label>
                <input
                  type="text"
                  autoFocus
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. MCBC"
                  style={styles.modalInput}
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Description / Notes (Optional)</label>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="e.g. Microcontrollers and Bio-Computing lecture slides and syllabus notes"
                  rows={3}
                  style={styles.modalTextarea}
                />
              </div>

              <div style={styles.modalFooter}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={styles.cancelBtn}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newTitle.trim() || isCreating}
                  style={{
                    ...styles.submitBtn,
                    opacity: !newTitle.trim() || isCreating ? 0.5 : 1,
                    cursor: !newTitle.trim() || isCreating ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isCreating ? 'Creating in Firebase...' : 'Create Notebook'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Classroom-Style In-Website Sliding PDF & PPT Viewer */}
      {activeViewingFile && (
        <DocumentViewerModal
          file={activeViewingFile}
          onClose={() => setActiveViewingFile(null)}
        />
      )}
    </main>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--bg-main)',
    color: 'var(--text-primary)',
    position: 'relative',
    overflow: 'hidden',
  },
  topBar: {
    height: '48px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 16px',
    borderBottom: '1px solid var(--border-subtle)',
    backgroundColor: 'var(--bg-main)',
    zIndex: 10,
    flexShrink: 0,
  },
  topBarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    minWidth: '120px',
  },
  topBarCenter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarRight: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    minWidth: '120px',
  },
  sidebarOpenBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '4px',
  },
  backButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.85)',
    fontSize: '12px',
    fontWeight: 500,
    padding: '5px 10px',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  navPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 12px',
    borderRadius: '16px',
    backgroundColor: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.08)',
    fontSize: '12px',
    color: 'rgba(255,255,255,0.7)',
    fontWeight: 500,
  },
  notificationToast: {
    position: 'absolute',
    top: '56px',
    right: '24px',
    backgroundColor: '#1f2b23',
    border: '1px solid #2e4a36',
    color: '#7ee787',
    padding: '10px 16px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
    zIndex: 99,
  },
  scrollArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '28px 32px 48px',
  },
  contentWrapper: {
    maxWidth: '1100px',
    margin: '0 auto',
  },
  heroSection: {
    textAlign: 'center',
    marginBottom: '28px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  heroIconBadge: {
    width: '48px',
    height: '48px',
    borderRadius: '12px',
    backgroundColor: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'var(--accent-terracotta)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '14px',
  },
  heroTitle: {
    fontSize: '28px',
    fontWeight: 550,
    fontFamily: 'serif',
    color: '#f7f4ed',
    margin: '0 0 8px 0',
    letterSpacing: '-0.02em',
  },
  heroSubtitle: {
    fontSize: '14px',
    color: '#a39e94',
    maxWidth: '580px',
    lineHeight: 1.5,
    margin: 0,
  },
  controlsBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    marginBottom: '24px',
    flexWrap: 'wrap',
  },
  searchBox: {
    flex: '1 1 240px',
    maxWidth: '360px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '8px',
    padding: '7px 12px',
    color: 'rgba(255,255,255,0.35)',
  },
  searchInput: {
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: '#f5f2eb',
    fontSize: '13px',
    width: '100%',
  },
  clearBtn: {
    background: 'transparent',
    border: 'none',
    color: '#7e796f',
    cursor: 'pointer',
    fontSize: '11px',
    padding: '2px',
  },
  filterPillsGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  filterPill: {
    padding: '5px 12px',
    borderRadius: '16px',
    border: '1px solid',
    fontSize: '12px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  newNotebookTopBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: 'var(--accent-terracotta)',
    border: 'none',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: 500,
    padding: '7px 14px',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  cardsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: '20px',
  },
  createNotebookCard: {
    backgroundColor: '#000000',
    border: '1px dashed rgba(255,255,255,0.15)',
    borderRadius: '12px',
    minHeight: '260px',
    display: 'flex',
    position: 'relative',
    cursor: 'pointer',
    overflow: 'hidden',
    transition: 'all 0.2s ease',
  },
  createCardSpine: {
    width: '10px',
    background: 'rgba(255,255,255,0.06)',
    flexShrink: 0,
    boxShadow: 'inset -2px 0 4px rgba(0, 0, 0, 0.4)',
  },
  createCardBody: {
    flex: 1,
    padding: '22px 18px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
  },
  createCardIconWrapper: {
    width: '48px',
    height: '48px',
    borderRadius: '12px',
    backgroundColor: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'var(--accent-terracotta)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '14px',
  },
  createCardTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#f5f2eb',
    margin: '0 0 6px 0',
  },
  createCardDesc: {
    fontSize: '12px',
    color: '#948f86',
    lineHeight: 1.45,
    margin: '0 0 16px 0',
  },
  createCardActionBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 14px',
    borderRadius: '16px',
    backgroundColor: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.8)',
    fontSize: '12px',
    fontWeight: 500,
  },
  notebookFolderCard: {
    backgroundColor: '#000000',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '12px',
    minHeight: '260px',
    display: 'flex',
    position: 'relative',
    cursor: 'pointer',
    overflow: 'hidden',
    transition: 'all 0.2s ease',
    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.4)',
  },
  bookSpine: {
    width: '10px',
    flexShrink: 0,
    boxShadow: 'inset -2px 0 4px rgba(0, 0, 0, 0.45)',
  },
  cardContent: {
    flex: 1,
    padding: '16px 16px 14px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  cardTopRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '12px',
  },
  folderBadgePill: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    padding: '3px 8px',
    borderRadius: '10px',
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    color: '#3b82f6',
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: '0.04em',
  },
  cardDeleteBtn: {
    background: 'transparent',
    border: 'none',
    color: '#6e6961',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'color 0.15s ease',
  },
  cardHeaderArea: {
    marginBottom: '12px',
  },
  folderCardIcon: {
    color: '#d4cfc5',
    marginBottom: '8px',
  },
  cardTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#f7f4ed',
    margin: '0 0 6px 0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  cardDesc: {
    fontSize: '12px',
    color: '#9c978e',
    lineHeight: 1.4,
    margin: 0,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  cardMetaBox: {
    padding: '8px 10px',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.07)',
    marginBottom: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  cardFileCount: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#f0ede6',
  },
  cardFileBreakdown: {
    fontSize: '11px',
    color: '#8e8980',
  },
  cardActionsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  cardUploadBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '5px',
    backgroundColor: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.85)',
    fontSize: '12px',
    fontWeight: 500,
    padding: '7px 8px',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  cardOpenBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    backgroundColor: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.6)',
    fontSize: '12px',
    fontWeight: 500,
    padding: '7px 10px',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },

  /* ========================================================
     FOLDER INTERIOR STYLES
     ======================================================== */
  folderContentWrapper: {
    maxWidth: '1000px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  folderHeaderCard: {
    backgroundColor: '#000000',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '12px',
    display: 'flex',
    overflow: 'hidden',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)',
  },
  folderSpineAccent: {
    width: '12px',
    flexShrink: 0,
    boxShadow: 'inset -2px 0 5px rgba(0, 0, 0, 0.4)',
  },
  folderHeaderDetails: {
    flex: 1,
    padding: '24px 28px',
  },
  folderTopRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '10px',
  },
  folderBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    padding: '3px 8px',
    borderRadius: '10px',
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    color: '#3b82f6',
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.05em',
  },
  fileCountPill: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    backgroundColor: 'var(--bg-main)',
    padding: '3px 8px',
    borderRadius: '8px',
    border: '1px solid var(--border-subtle)',
  },
  folderTitle: {
    fontSize: '26px',
    fontWeight: 600,
    fontFamily: 'var(--font-sans)',
    color: '#ffffff',
    margin: '0 0 8px 0',
  },
  folderDesc: {
    fontSize: '14px',
    color: '#a09b91',
    lineHeight: 1.5,
    margin: '0 0 20px 0',
    maxWidth: '720px',
  },
  folderHeaderActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
  },
  folderUploadBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    backgroundColor: 'var(--accent-terracotta)',
    border: 'none',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: 500,
    padding: '8px 16px',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  folderStudyBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    backgroundColor: '#2b2a26',
    border: '1px solid #3c3a33',
    color: '#f5f2eb',
    fontSize: '13px',
    fontWeight: 500,
    padding: '8px 16px',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  folderDeleteBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: 'transparent',
    border: '1px solid #3a2b2b',
    color: '#f87171',
    fontSize: '13px',
    fontWeight: 500,
    padding: '8px 14px',
    borderRadius: '8px',
    cursor: 'pointer',
    marginLeft: 'auto',
  },
  folderDropZone: {
    border: '1px dashed #3a3832',
    borderRadius: '12px',
    padding: '28px 20px',
    textAlign: 'center',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    transition: 'all 0.2s ease',
  },
  folderDropIcon: {
    color: 'var(--accent-terracotta)',
    marginBottom: '10px',
  },
  folderDropTitle: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#f5f2eb',
    margin: '0 0 6px 0',
  },
  folderDropDesc: {
    fontSize: '13px',
    color: '#948f86',
    margin: '0 0 14px 0',
  },
  supportedBadgeGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  docBadge: {
    padding: '3px 8px',
    borderRadius: '6px',
    backgroundColor: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    fontSize: '11px',
    color: 'rgba(255,255,255,0.65)',
    fontWeight: 500,
  },
  filesSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  filesSectionTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#f5f2eb',
    margin: 0,
  },
  emptyFolderBox: {
    padding: '40px 20px',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.07)',
    backgroundColor: '#000000',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    color: 'rgba(255,255,255,0.3)',
  },
  emptyFolderTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#d4cfc5',
    margin: '12px 0 6px 0',
  },
  emptyFolderDesc: {
    fontSize: '13px',
    color: '#8e8980',
    maxWidth: '460px',
    margin: 0,
    lineHeight: 1.5,
  },
  filesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '16px',
  },
  fileCard: {
    backgroundColor: '#000000',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '10px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    gap: '10px',
    boxShadow: '0 3px 10px rgba(0,0,0,0.4)',
  },
  fileCardTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fileTypeBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 8px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.04em',
  },
  fileDeleteBtn: {
    background: 'transparent',
    border: 'none',
    color: '#706b63',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileName: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#f8f5ee',
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  fileMetaRow: {
    fontSize: '11px',
    color: '#8a857c',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  fileActionsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '6px',
  },
  fileViewBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    backgroundColor: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.85)',
    fontSize: '12px',
    fontWeight: 500,
    padding: '7px 10px',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
  },
  fileDownloadBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: 'rgba(255,255,255,0.55)',
    padding: '7px 10px',
    borderRadius: '6px',
    cursor: 'pointer',
    textDecoration: 'none',
  },

  /* ========================================================
     MODAL STYLES
     ======================================================== */
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: '16px',
  },
  modalBox: {
    width: '100%',
    maxWidth: '480px',
    backgroundColor: '#000000',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '14px',
    boxShadow: '0 20px 48px rgba(0, 0, 0, 0.8)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  modalTitleGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  modalIconWrap: {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    backgroundColor: 'rgba(255,255,255,0.05)',
    color: 'var(--accent-terracotta)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHeading: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#f7f4ed',
    margin: 0,
  },
  modalCloseBtn: {
    background: 'transparent',
    border: 'none',
    color: '#847f77',
    cursor: 'pointer',
    fontSize: '16px',
    padding: '4px',
  },
  modalBody: {
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  modalSubheading: {
    fontSize: '13px',
    color: '#9e998f',
    lineHeight: 1.45,
    margin: 0,
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  formLabel: {
    fontSize: '12px',
    fontWeight: 500,
    color: '#cfcac0',
  },
  modalInput: {
    backgroundColor: '#000000',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    padding: '9px 12px',
    fontSize: '14px',
    color: 'rgba(255,255,255,0.85)',
    outline: 'none',
  },
  modalTextarea: {
    backgroundColor: '#000000',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    padding: '9px 12px',
    fontSize: '13px',
    color: 'rgba(255,255,255,0.85)',
    outline: 'none',
    resize: 'vertical',
  },
  modalFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '10px',
    marginTop: '8px',
  },
  cancelBtn: {
    backgroundColor: 'transparent',
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.6)',
    fontSize: '13px',
    fontWeight: 500,
    padding: '8px 14px',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  submitBtn: {
    backgroundColor: 'var(--accent-terracotta)',
    border: 'none',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: 500,
    padding: '8px 16px',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'opacity 0.15s ease',
  },
};
