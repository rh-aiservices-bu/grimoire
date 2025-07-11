import React from 'react';
import {
  Modal,
  ModalVariant,
  Button,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Title,
  Alert,
} from '@patternfly/react-core';
import { ExclamationTriangleIcon } from '@patternfly/react-icons';
import { Project } from '../types';

interface DeleteProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  project: Project | null;
  isDeleting: boolean;
}

export const DeleteProjectModal: React.FC<DeleteProjectModalProps> = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  project,
  isDeleting 
}) => {
  if (!project) return null;

  return (
    <Modal
      variant={ModalVariant.small}
      title="Delete Project"
      isOpen={isOpen}
      onClose={onClose}
      titleIconVariant="warning"
    >
      <ModalHeader />
      <ModalBody>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
          <ExclamationTriangleIcon 
            style={{ color: 'var(--pf-global--warning-color--100)', fontSize: '1.5rem', marginTop: '0.25rem' }} 
          />
          <div>
            <Title headingLevel="h3" size="lg" style={{ marginBottom: '1rem' }}>
              Are you sure you want to delete this project?
            </Title>
            <p style={{ marginBottom: '1rem' }}>
              <strong>Project:</strong> {project.name}
            </p>
            <Alert variant="warning" title="This action cannot be undone" isInline>
              Deleting this project will permanently remove:
              <ul style={{ marginTop: '0.5rem', marginBottom: 0 }}>
                <li>All prompt history and responses</li>
                <li>All ratings and notes</li>
                <li>Project configuration</li>
              </ul>
            </Alert>
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button 
          key="delete" 
          variant="danger" 
          onClick={onConfirm}
          isLoading={isDeleting}
          isDisabled={isDeleting}
        >
          {isDeleting ? 'Deleting...' : 'Delete Project'}
        </Button>
        <Button 
          key="cancel" 
          variant="link" 
          onClick={onClose}
          isDisabled={isDeleting}
        >
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  );
};