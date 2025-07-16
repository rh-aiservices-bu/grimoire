import React, { useState, useEffect, useRef } from 'react';
import {
  Card,
  CardTitle,
  CardBody,
  Button,
  Modal,
  ModalVariant,
  ModalHeader,
  ModalBody,
  ModalFooter,
  DescriptionList,
  DescriptionListGroup,
  DescriptionListTerm,
  DescriptionListDescription,
  Flex,
  FlexItem,
  Badge,
  FormSelect,
  FormSelectOption,
  Alert,
  Spinner,
} from '@patternfly/react-core';
import { ThumbsUpIcon, ThumbsDownIcon, EditIcon, StarIcon, SyncAltIcon } from '@patternfly/react-icons';
import { PromptHistory, PendingPR, GitUser } from '../../types';
import { NotesModal, ProdConfirmationModal } from '../modals';
import { api } from '../../api';

interface HistoryLogProps {
  history: PromptHistory[];
  onHistoryUpdate: () => void;
  projectId: number;
  hasGitRepo?: boolean;
  gitUser?: GitUser | null;
  onGitAuth?: () => void;
  onNotification?: (notification: {
    title: string;
    variant: 'success' | 'danger' | 'warning' | 'info';
    message?: string;
    actionLinks?: Array<{ text: string; url: string }>;
    actionButton?: { text: string; onClick: () => void };
  }) => void;
  viewMode?: 'development' | 'git';
  onViewModeChange?: (mode: 'development' | 'git') => void;
}

export const HistoryLog: React.FC<HistoryLogProps> = ({ 
  history, 
  onHistoryUpdate, 
  projectId, 
  hasGitRepo = false, 
  gitUser, 
  onGitAuth, 
  onNotification,
  viewMode: externalViewMode,
  onViewModeChange: externalOnViewModeChange
}) => {
  const [selectedItem, setSelectedItem] = useState<PromptHistory | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
  const [notesItem, setNotesItem] = useState<PromptHistory | null>(null);
  const [isProdModalOpen, setIsProdModalOpen] = useState(false);
  const [prodItem, setProdItem] = useState<PromptHistory | null>(null);
  // Use external view mode if provided, otherwise internal state
  const [internalViewMode, setInternalViewMode] = useState<'development' | 'git'>('development');
  const viewMode = externalViewMode ?? internalViewMode;
  const setViewMode = externalOnViewModeChange ?? setInternalViewMode;
  const [gitHistory, setGitHistory] = useState<any[]>([]);
  const [pendingPRs, setPendingPRs] = useState<PendingPR[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreatingPR, setIsCreatingPR] = useState(false);
  const refreshIntervalRef = useRef<number | null>(null);
  
  // Cache for git history and pending PRs
  const gitHistoryCache = useRef<Map<number, { data: any[]; timestamp: number }>>(new Map());
  const pendingPRsCache = useRef<Map<number, { data: PendingPR[]; timestamp: number }>>(new Map());
  const CACHE_DURATION = 60000; // 60 seconds cache (backend is now smarter with incremental sync)
  const MAX_CACHE_SIZE = 10; // Limit cache to prevent memory growth
  
  // Cache cleanup utility
  const cleanupCache = (cache: Map<number, { data: any; timestamp: number }>) => {
    const now = Date.now();
    // Remove expired entries
    for (const [key, value] of cache.entries()) {
      if (now - value.timestamp > CACHE_DURATION) {
        cache.delete(key);
      }
    }
    // Remove oldest entries if cache is too large
    if (cache.size > MAX_CACHE_SIZE) {
      const entries = Array.from(cache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp);
      const entriesToRemove = entries.slice(0, cache.size - MAX_CACHE_SIZE);
      entriesToRemove.forEach(([key]) => cache.delete(key));
    }
  };

  const handleItemClick = (item: PromptHistory) => {
    setSelectedItem(item);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedItem(null);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const truncateText = (text: string, maxLength: number = 100) => {
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  };

  const handleRating = async (item: PromptHistory, rating: 'thumbs_up' | 'thumbs_down') => {
    try {
      const newRating = item.rating === rating ? undefined : rating; // Toggle if same rating
      
      // Check if this is a backend test item
      await api.updatePromptHistory(item.project_id, item.id, { rating: newRating });
      
      onHistoryUpdate();
    } catch (error) {
      console.error('Failed to update rating:', error);
    }
  };

  const handleNotesClick = (item: PromptHistory) => {
    setNotesItem(item as any); // Cast to work with existing modal
    setIsNotesModalOpen(true);
  };

  const handleSaveNotes = async (notes: string) => {
    if (!notesItem) return;
    
    try {
      // Check if this is a backend test item
      await api.updatePromptHistory(notesItem.project_id, notesItem.id, { notes });
      
      onHistoryUpdate();
    } catch (error) {
      console.error('Failed to save notes:', error);
    }
  };

  const handleProdClick = (item: PromptHistory) => {
    setProdItem(item);
    setIsProdModalOpen(true);
  };

  const handleProdButtonClick = (item: PromptHistory) => {
    setProdItem(item);
    setIsProdModalOpen(true);
  };

  const handlePromptTestClick = (item: PromptHistory) => {
    // For prompt items, use the same logic as handleProdClick but only for test actions
    setProdItem(item);
    setIsProdModalOpen(true);
  };


  const handleProdConfirm = async () => {
    if (!prodItem) return;
    
    setIsCreatingPR(true);
    try {
      if (hasGitRepo) {
        // Check if user is authenticated with git
        if (!gitUser) {
          alert('Please authenticate with git first to save test settings or create production PRs.');
          if (onGitAuth) {
            onGitAuth();
          }
          return;
        }
        
        try {
          // Prompt item - determine if this is a test or production action
          const isTestAction = !prodItem.is_prod; // If not already marked as test, this is a test action
          
          if (isTestAction) {
            // Test action - save test settings to git
            const result = await api.tagPromptAsTest(projectId, prodItem.id);
            console.log('Test settings saved to git:', result);
            
            // Show success notification with commit info
            if (onNotification) {
              onNotification({
                title: 'Test Settings Saved to Git',
                variant: 'success',
                message: `Test settings have been saved to git repository. ${result.commit_sha ? 'Commit: ' + result.commit_sha.substring(0, 7) : ''}`,
                actionLinks: result.commit_url ? [{ text: 'View Commit', url: result.commit_url }] : []
              });
            }
          } else {
            // Production action - create PR
            const result = await api.tagPromptAsProd(projectId, prodItem.id);
            console.log('PR created:', result);
            
            // Show success notification with link to PR
            if (onNotification) {
              onNotification({
                title: 'Pull Request Created Successfully',
                variant: 'success',
                message: `PR #${result.pr_number} has been created. Click the link below to review and merge it.`,
                actionLinks: [{ text: `View PR #${result.pr_number}`, url: result.pr_url }]
              });
            }
          }
          
          // Invalidate cache and refresh test history (moved inside try block)
          console.log('Test settings saved - invalidating cache and refreshing data');
          gitHistoryCache.current.delete(projectId);
          pendingPRsCache.current.delete(projectId);
          
          // Always refresh main history to show updated test status
          onHistoryUpdate();
          
          if (viewMode === 'git') {
            await Promise.all([loadPendingPRs(true), loadGitHistory(false, true)]);
          }
          
        } catch (error: any) {
          // Handle authentication errors
          if (error.response?.status === 401) {
            if (onNotification) {
              onNotification({
                title: 'Git Authentication Required',
                variant: 'warning',
                message: 'Your git authentication has expired. Please re-authenticate to save test settings or create PRs.'
              });
            }
            // Trigger git authentication dialog
            if (onGitAuth) {
              onGitAuth();
            }
            return; // Don't fall through to generic error handling
          }
          
          // Handle platform-specific errors
          if (error.response?.status === 501) {
            if (onNotification) {
              onNotification({
                title: 'Feature Not Available',
                variant: 'warning',
                message: `This feature is not yet supported for ${gitUser?.git_platform}.`,
              });
            }
            return; // Don't fall through to generic error handling
          }
          
          // Handle empty repository error
          if (error.response?.status === 400 && error.response?.data?.detail?.includes('git repository is empty')) {
            if (onNotification) {
              onNotification({
                title: 'Empty Repository',
                variant: 'warning',
                message: error.response.data.detail,
              });
            }
            return; // Don't fall through to generic error handling
          }
          
          // Handle specific API errors with better messages
          if (error.response?.status === 400) {
            if (onNotification) {
              onNotification({
                title: 'Git Operation Failed',
                variant: 'danger',
                message: error.response.data.detail || 'Failed to save test settings or create production PR.',
              });
            }
            return;
          }
          
          if (error.response?.status === 401 || error.response?.status === 403) {
            if (onNotification) {
              onNotification({
                title: 'Authentication Error',
                variant: 'danger',
                message: 'Invalid git credentials or insufficient repository permissions.',
                actionButton: onGitAuth ? { 
                  text: 'Re-authenticate with Git', 
                  onClick: onGitAuth 
                } : undefined
              });
            }
            return;
          }
          
          throw error; // Re-throw for generic error handling
        }
      } else {
        // Original behavior for projects without git repo
        const newTestStatus = !prodItem.is_prod;
        await api.updatePromptHistory(prodItem.project_id, prodItem.id, { is_prod: newTestStatus });
        onHistoryUpdate();
      }
    } catch (error) {
      console.error('Failed to update test status:', error);
      if (onNotification) {
        onNotification({
          title: 'Git Operation Failed',
          variant: 'danger',
          message: 'Failed to save test settings or create production PR. This might be due to invalid git credentials or insufficient repository permissions.',
          actionButton: onGitAuth ? { 
            text: 'Re-authenticate with Git', 
            onClick: onGitAuth 
          } : undefined
        });
      }
    } finally {
      setIsCreatingPR(false);
    }
  };

  const loadGitHistory = async (isManualRefresh = false, forceRefresh = false) => {
    if (!hasGitRepo) return;
    
    // Check cache first (unless manual refresh or force refresh)
    if (!isManualRefresh && !forceRefresh) {
      const cached = gitHistoryCache.current.get(projectId);
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        console.log(`Using cached git history for project ${projectId}`);
        setGitHistory(cached.data);
        return;
      }
    }
    
    if (isManualRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    
    try {
      console.log(`Fetching fresh git history for project ${projectId}`);
      const history = await api.getGitHistory(projectId);
      setGitHistory(history);
      
      // Cache the result
      gitHistoryCache.current.set(projectId, {
        data: history,
        timestamp: Date.now()
      });
      
      // Cleanup cache periodically
      cleanupCache(gitHistoryCache.current);
    } catch (error) {
      console.error('Failed to load git history:', error);
      setGitHistory([]);
    } finally {
      if (isManualRefresh) {
        setIsRefreshing(false);
      } else {
        setIsLoading(false);
      }
    }
  };

  const loadPendingPRs = async (forceRefresh = false) => {
    if (!hasGitRepo || !gitUser) return;
    
    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = pendingPRsCache.current.get(projectId);
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        console.log(`Using cached pending PRs for project ${projectId}`);
        setPendingPRs(cached.data);
        return;
      }
    }
    
    try {
      console.log(`Fetching fresh pending PRs for project ${projectId}`);
      // This now does live checking automatically
      const prs = await api.getPendingPRs(projectId);
      setPendingPRs(prs);
      
      // Cache the result
      pendingPRsCache.current.set(projectId, {
        data: prs,
        timestamp: Date.now()
      });
      
      // Cleanup cache periodically
      cleanupCache(pendingPRsCache.current);
    } catch (error) {
      console.error('Failed to load pending PRs:', error);
      setPendingPRs([]);
    }
  };

  const handleManualRefresh = async () => {
    if (!hasGitRepo || !gitUser) return;
    console.log('Manual refresh triggered - bypassing cache');
    if (viewMode === 'git') {
      await Promise.all([
        loadGitHistory(true, true), // isManualRefresh=true, forceRefresh=true
        loadPendingPRs(true) // forceRefresh=true
      ]);
    } else {
      // For development view, just refresh the current entries
      onHistoryUpdate();
    }
  };

  // Auto-refresh data when git user changes or view mode changes
  useEffect(() => {
    if (viewMode === 'git' && hasGitRepo && gitUser) {
      loadGitHistory();
      loadPendingPRs();
    } else if (viewMode === 'development') {
      onHistoryUpdate();
    }
  }, [gitUser, viewMode, hasGitRepo]);

  // Reload backend history when parent history changes (e.g., after backend test completes)
  useEffect(() => {
    if (viewMode === 'development') {
      onHistoryUpdate();
    }
  }, [history, viewMode]);

  // Set up auto-refresh interval for git view
  useEffect(() => {
    // Clear any existing interval
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
    }

    // Set up new interval if conditions are met
    if (viewMode === 'git' && hasGitRepo && gitUser) {
      refreshIntervalRef.current = setInterval(() => {
        console.log('Auto-refreshing git history (force refresh)...');
        loadGitHistory(false, true); // isManualRefresh=false, forceRefresh=true
        loadPendingPRs(true); // forceRefresh=true
      }, 30000); // 30 seconds
    }

    // Cleanup function
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [viewMode, hasGitRepo, gitUser, projectId]);


  const handleViewModeChange = (mode: 'development' | 'git') => {
    setViewMode(mode);
    if (mode === 'git' && hasGitRepo && gitUser) {
      loadGitHistory();
      loadPendingPRs();
    } else if (mode === 'development') {
      onHistoryUpdate();
    }
  };

  // Merge experimental and backend testing history for development view
  // Separate current entries (id -1 and -2) from regular history
  const currentProd = viewMode === 'development' 
    ? history.find(item => item.id === -1)
    : null;
  
  const currentTest = viewMode === 'development' 
    ? history.find(item => item.id === -2)
    : null;
  
  const regularHistory = viewMode === 'development' 
    ? history.filter(item => item.id !== -1 && item.id !== -2)
    : []; // Git history doesn't include regular history or backend testing
  
  // Sort regular history by date (newest first) - ensure proper date parsing
  const sortedRegularHistory = regularHistory.sort((a, b) => {
    const dateA = new Date(a.created_at);
    const dateB = new Date(b.created_at);
    return dateB.getTime() - dateA.getTime();
  });
  
  // Build final history with current entries always at the top in fixed order
  const mergedHistory = viewMode === 'development' 
    ? [
        ...(currentProd ? [currentProd] : []),
        ...(currentTest ? [currentTest] : []),
        ...sortedRegularHistory
      ]
    : gitHistory; // Git history view shows only git commits
  
  const currentHistory = mergedHistory;

  return (
    <>
      <Card isFullHeight>
        <CardTitle>
          <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }}>
            <FlexItem>History Log</FlexItem>
            <FlexItem>
              <Flex spaceItems={{ default: 'spaceItemsSm' }}>
                {((viewMode === 'development' && hasGitRepo && gitUser) || (viewMode === 'git' && gitUser)) && (
                  <FlexItem>
                    <Button
                      variant="plain"
                      size="sm"
                      icon={isRefreshing ? <Spinner size="sm" /> : <SyncAltIcon />}
                      onClick={viewMode === 'development' ? onHistoryUpdate : handleManualRefresh}
                      isDisabled={isRefreshing}
                      title={viewMode === 'development' ? 'Refresh current prod/test from git' : 'Refresh git history'}
                    >
                      {isRefreshing ? 'Refreshing...' : ''}
                    </Button>
                  </FlexItem>
                )}
                <FlexItem>
                  <FormSelect
                    value={viewMode}
                    onChange={(_event, value) => {
                      handleViewModeChange(value as 'development' | 'git');
                    }}
                    aria-label="Select history view"
                    style={{ width: '150px' }}
                  >
                    <FormSelectOption key="" value="development" label="Development" />
                    <FormSelectOption key="git" value="git" label="Git History" />
                  </FormSelect>
                </FlexItem>
              </Flex>
            </FlexItem>
          </Flex>
        </CardTitle>
        <CardBody>
          {hasGitRepo && !gitUser && viewMode === 'git' && (
            <Alert variant="warning" title="Git Authentication Required" style={{ marginBottom: '1rem' }}>
              <p>This project uses git for version control. Please authenticate with your git platform to view git history.</p>
              {onGitAuth && (
                <Button variant="primary" size="sm" onClick={onGitAuth} style={{ marginTop: '0.5rem' }}>
                  Authenticate with Git
                </Button>
              )}
            </Alert>
          )}

          {hasGitRepo && gitUser && (
            <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', backgroundColor: '#f8f9fa', borderRadius: '4px', fontSize: '14px' }}>
              <span>📡 Git: {gitUser.git_username}@{gitUser.git_platform}</span>
              {onGitAuth && (
                <Button variant="link" size="sm" onClick={onGitAuth}>
                  Re-authenticate
                </Button>
              )}
            </div>
          )}


          {viewMode === 'git' && hasGitRepo && pendingPRs.length > 0 && (
            <Alert variant="info" title="Pending Pull Requests" style={{ marginBottom: '1rem' }}>
              <p>There are {pendingPRs.length} pending pull request(s) for production prompts:</p>
              <ul style={{ marginTop: '0.5rem' }}>
                {pendingPRs.map(pr => (
                  <li key={pr.id}>
                    <a href={pr.pr_url} target="_blank" rel="noopener noreferrer">
                      PR #{pr.pr_number}
                    </a>
                    {' - '}
                    {new Date(pr.created_at).toLocaleDateString()}
                  </li>
                ))}
              </ul>
            </Alert>
          )}

          {viewMode === 'git' && hasGitRepo && gitHistory.length === 0 && pendingPRs.length === 0 && !isLoading && (
            <Alert variant="warning" title="No Git History" style={{ marginBottom: '1rem' }}>
              <p>No commits found for prod or test files in this repository.</p>
              <p>Create some prompts and tag them as production or test to see git history.</p>
            </Alert>
          )}

          {currentHistory.length === 0 && !isLoading ? (
            <p>
              {viewMode === 'development' 
                ? "No development history yet. Generate some responses or test your backend to see them here."
                : viewMode === 'git' 
                  ? (hasGitRepo 
                    ? "No git history found for prod or test files."
                    : "No git repository configured for this project.")
                  : "No history yet."
              }
            </p>
          ) : (
            <div style={{ 
              maxHeight: 'calc(100vh - 300px)', 
              overflowY: 'auto',
              paddingRight: '0.5rem'
            }}>
              {currentHistory.map((item, index) => {
                // In Git History view, skip any backend test items that might have leaked through
                if (viewMode === 'git') {
                  const hasBackendTestProps = (item as any).backend_response !== undefined || 
                                              (item as any).response_time_ms !== undefined;
                  if (hasBackendTestProps) {
                    return null; // Skip backend test items in git view
                  }
                }
                
                // Determine item type based on view mode
                const isGitCommit = viewMode === 'git';
                const promptItem = item as PromptHistory;
                const gitItem = item as any; // Git commit item
                const isCurrentProd = item.id === -1;
                const isCurrentTest = item.id === -2;
                const isCurrentEntry = isCurrentProd || isCurrentTest;
                
                // Generate unique keys to avoid conflicts between different history types
                const uniqueKey = isGitCommit ? `git-${gitItem.sha}` : 
                                 isCurrentProd ? `current-prod-${item.id}` :
                                 isCurrentTest ? `current-test-${item.id}` :
                                 `prompt-${item.id}`;

                return (
                  <div 
                    key={uniqueKey}
                    style={{ 
                      padding: '1rem',
                      borderBottom: '1px solid #e5e5e5',
                      marginBottom: '0.5rem',
                      // Special styling for current entries and git commits
                      backgroundColor: isCurrentProd ? '#f0fff0' : 
                                      isCurrentTest ? '#fff3cd' :
                                      isGitCommit ? '#f9f9f9' :
                                      'transparent',
                      borderLeft: isCurrentProd ? '4px solid #28a745' : 
                                  isCurrentTest ? '4px solid #fd7e14' :
                                  isGitCommit ? `4px solid ${gitItem.color}` :
                                  'none',
                      borderRadius: (isCurrentEntry || isGitCommit) ? '4px' : '0',
                      // Add a subtle border for current entries and git commits
                      border: (isCurrentEntry || isGitCommit) ? '1px solid #ddd' : 'none'
                    }}
                  >
                    <div 
                      style={{ cursor: 'pointer' }}
                      onClick={() => handleItemClick(item)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <small style={{ color: '#6a6e73' }}>
                          {isGitCommit ? formatDate(gitItem.date) : formatDate(item.created_at)}
                        </small>
                        {/* Show badges based on view mode and item type */}
                        {isCurrentProd && (
                          <Badge style={{ backgroundColor: '#28a745', color: 'white' }}>
                            🚀 PRODUCTION
                          </Badge>
                        )}
                        {isCurrentTest && (
                          <Badge style={{ backgroundColor: '#fd7e14', color: 'white' }}>
                            🧪 TEST
                          </Badge>
                        )}
                        {isGitCommit && (
                          <Badge style={{ backgroundColor: gitItem.color, color: 'white' }}>
                            {gitItem.icon} {gitItem.badge}
                          </Badge>
                        )}
                      </div>
                      
                      {/* Git commit content */}
                      {isGitCommit ? (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', marginTop: '0.25rem', marginBottom: '0.25rem' }}>
                            <strong style={{ marginRight: '0.5rem' }}>{gitItem.author}</strong>
                            <small style={{ color: '#6a6e73' }}>
                              {gitItem.sha.substring(0, 7)}
                            </small>
                          </div>
                          <p style={{ fontWeight: 'bold', marginTop: '0.25rem', marginBottom: '0.25rem' }}>
                            {truncateText(gitItem.message)}
                          </p>
                          <small style={{ color: '#6a6e73' }}>
                            Modified: {gitItem.file_path}
                          </small>
                        </>
                      ) : (
                        <p style={{ fontWeight: 'bold', marginTop: '0.25rem', marginBottom: '0.25rem' }}>
                          {truncateText(item.user_prompt)}
                        </p>
                      )}
                      {!isGitCommit && promptItem.response && (
                        <small style={{ marginTop: '0.25rem', display: 'block' }}>
                          {truncateText(promptItem.response)}
                        </small>
                      )}
                    </div>
                    
                    {/* Show appropriate action buttons based on view mode */}
                    {!isCurrentEntry && !isGitCommit && (
                      <Flex style={{ marginTop: '0.5rem' }} spaceItems={{ default: 'spaceItemsSm' }}>
                        {viewMode === 'development' ? (
                          <>
                            {/* Show rating and notes buttons for prompt items */}
                            <FlexItem>
                              <Button
                                variant={promptItem.rating === 'thumbs_up' ? 'primary' : 'tertiary'
                                }
                                icon={<ThumbsUpIcon />}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRating(promptItem, 'thumbs_up');
                                }}
                                size="sm"
                                title="Thumbs up"
                              />
                            </FlexItem>
                            <FlexItem>
                              <Button
                                variant={promptItem.rating === 'thumbs_down' ? 'primary' : 'tertiary'
                                }
                                icon={<ThumbsDownIcon />}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRating(promptItem, 'thumbs_down');
                                }}
                                size="sm"
                                title="Thumbs down"
                              />
                            </FlexItem>
                            <FlexItem>
                              <Button
                                variant={promptItem.notes ? 'primary' : 'tertiary'
                                }
                                icon={<EditIcon />}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleNotesClick(promptItem);
                                }}
                                size="sm"
                              >
                                Notes
                              </Button>
                            </FlexItem>
                            
                            {/* Test button - available for prompt items */}
                            <FlexItem>
                              <Button
                                variant={promptItem.is_prod ? 'primary' : 'tertiary'}
                                icon={<StarIcon />}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePromptTestClick(promptItem);
                                }}
                                size="sm"
                                title={promptItem.is_prod ? 'Remove test tag' : 'Mark as test'}
                              >
                                Test
                              </Button>
                            </FlexItem>
                            
                            {/* Prod button - available for prompt items */}
                            <FlexItem>
                              <Button
                                variant="tertiary"
                                icon={isCreatingPR && prodItem?.id === promptItem.id ? <Spinner size="sm" /> : <StarIcon />}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleProdButtonClick(promptItem);
                                }}
                                size="sm"
                                title={promptItem.has_merged_pr ? 'Already in production' : promptItem.is_prod ? 'Create production PR' : 'Must mark as test first'}
                                isDisabled={!promptItem.is_prod || promptItem.has_merged_pr || (isCreatingPR && prodItem?.id === promptItem.id)}
                              >
                                Prod
                              </Button>
                            </FlexItem>
                          </>
                        ) : (
                          <>
                            {/* Git view - no action buttons needed */}
                          </>
                        )}
                      </Flex>
                    )}
                    
                    {/* Show read-only indicator for current entries */}
                    {isCurrentEntry && (
                      <div style={{ marginTop: '0.5rem', fontSize: '12px', color: '#6a6e73', fontStyle: 'italic' }}>
                        📖 Read-only view from git repository
                      </div>
                    )}
                    
                    {/* Show git link for git commits */}
                    {isGitCommit && (
                      <div style={{ marginTop: '0.5rem', fontSize: '12px' }}>
                        <a 
                          href={gitItem.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          style={{ color: '#0066cc', textDecoration: 'none' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          🔗 View commit in {gitUser?.git_platform || 'git'}
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>

      <Modal
        variant={ModalVariant.large}
        title="Prompt History Detail"
        isOpen={isModalOpen}
        onClose={closeModal}
      >
        <ModalHeader />
        <ModalBody>
          {selectedItem && (
            <DescriptionList>
              <DescriptionListGroup>
                <DescriptionListTerm>Timestamp</DescriptionListTerm>
                <DescriptionListDescription>
                  {formatDate(selectedItem.created_at)}
                </DescriptionListDescription>
              </DescriptionListGroup>

              <DescriptionListGroup>
                <DescriptionListTerm>User Prompt</DescriptionListTerm>
                <DescriptionListDescription>
                  <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                    {selectedItem.user_prompt}
                  </pre>
                </DescriptionListDescription>
              </DescriptionListGroup>

              {/* Show backend test specific fields */}
              {viewMode === 'backend' && 'backend_response' in selectedItem && (
                <>
                  <DescriptionListGroup>
                    <DescriptionListTerm>Backend Response</DescriptionListTerm>
                    <DescriptionListDescription>
                      <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                        {selectedItem.backend_response || 'No response'}
                      </pre>
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  
                  {selectedItem.response_time_ms && (
                    <DescriptionListGroup>
                      <DescriptionListTerm>Response Time</DescriptionListTerm>
                      <DescriptionListDescription>
                        {selectedItem.response_time_ms}ms
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                  )}
                  
                  {selectedItem.status_code && (
                    <DescriptionListGroup>
                      <DescriptionListTerm>Status Code</DescriptionListTerm>
                      <DescriptionListDescription>
                        {selectedItem.status_code}
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                  )}
                  
                  {selectedItem.error_message && (
                    <DescriptionListGroup>
                      <DescriptionListTerm>Error Message</DescriptionListTerm>
                      <DescriptionListDescription>
                        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', color: 'red' }}>
                          {selectedItem.error_message}
                        </pre>
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                  )}
                </>
              )}

              {/* Show prompt history specific fields */}
              {viewMode !== 'backend' && 'system_prompt' in selectedItem && (
                <>
                  {selectedItem.system_prompt && (
                    <DescriptionListGroup>
                      <DescriptionListTerm>System Prompt</DescriptionListTerm>
                      <DescriptionListDescription>
                        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                          {selectedItem.system_prompt}
                        </pre>
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                  )}

                  {selectedItem.variables && Object.keys(selectedItem.variables).length > 0 && (
                    <DescriptionListGroup>
                      <DescriptionListTerm>Variables</DescriptionListTerm>
                      <DescriptionListDescription>
                        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                          {Object.entries(selectedItem.variables)
                            .map(([key, value]) => `${key}: ${value}`)
                            .join('\n')}
                        </pre>
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                  )}

                  <DescriptionListGroup>
                    <DescriptionListTerm>Model Parameters</DescriptionListTerm>
                    <DescriptionListDescription>
                      Temperature: {selectedItem.temperature ?? 'N/A'}<br />
                      Max Length: {selectedItem.max_len ?? 'N/A'}<br />
                      Top P: {selectedItem.top_p ?? 'N/A'}<br />
                      Top K: {selectedItem.top_k ?? 'N/A'}
                    </DescriptionListDescription>
                  </DescriptionListGroup>

                  {selectedItem.response && (
                    <DescriptionListGroup>
                      <DescriptionListTerm>Response</DescriptionListTerm>
                      <DescriptionListDescription>
                        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                          {selectedItem.response}
                        </pre>
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                  )}

                  {selectedItem.rating && (
                    <DescriptionListGroup>
                      <DescriptionListTerm>Rating</DescriptionListTerm>
                      <DescriptionListDescription>
                        {selectedItem.rating === 'thumbs_up' ? '👍 Thumbs Up' : '👎 Thumbs Down'}
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                  )}

                  {selectedItem.notes && (
                    <DescriptionListGroup>
                      <DescriptionListTerm>Notes</DescriptionListTerm>
                      <DescriptionListDescription>
                        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                          {selectedItem.notes}
                        </pre>
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                  )}

                  <DescriptionListGroup>
                    <DescriptionListTerm>Production Status</DescriptionListTerm>
                    <DescriptionListDescription>
                      {selectedItem.is_prod ? (
                        <Badge>
                          <StarIcon style={{ fontSize: '12px', marginRight: '4px' }} />
                          PROD
                        </Badge>
                      ) : (
                        'Not marked as production'
                      )}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                </>
              )}
            </DescriptionList>
          )}
        </ModalBody>
        <ModalFooter>
          <Button key="close" variant="primary" onClick={closeModal}>
            Close
          </Button>
        </ModalFooter>
      </Modal>

      <NotesModal
        isOpen={isNotesModalOpen}
        onClose={() => setIsNotesModalOpen(false)}
        onSave={handleSaveNotes}
        initialNotes={notesItem?.notes || ''}
      />

      <ProdConfirmationModal
        isOpen={isProdModalOpen}
        onClose={() => setIsProdModalOpen(false)}
        onConfirm={handleProdConfirm}
        isCurrentlyProd={prodItem?.is_prod || false}
        hasGitRepo={hasGitRepo}
      />

    </>
  );
};