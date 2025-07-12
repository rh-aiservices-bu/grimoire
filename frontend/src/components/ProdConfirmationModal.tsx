import React from 'react';
import {
  Modal,
  ModalVariant,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Badge,
} from '@patternfly/react-core';
import { StarIcon, ExclamationTriangleIcon } from '@patternfly/react-icons';

interface ProdConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isCurrentlyProd: boolean;
  hasGitRepo?: boolean;
}

export const ProdConfirmationModal: React.FC<ProdConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isCurrentlyProd,
  hasGitRepo = false,
}) => {
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <Modal
      variant={ModalVariant.small}
      title={isCurrentlyProd ? "Remove Production Tag" : "Mark as Production"}
      isOpen={isOpen}
      onClose={onClose}
      titleIconVariant={isCurrentlyProd ? "warning" : "info"}
    >
      <ModalHeader />
      <ModalBody>
        <div>
          {isCurrentlyProd ? (
            <>
              <p>
                <ExclamationTriangleIcon style={{ marginRight: '8px', color: '#f0ab00' }} />
                Are you sure you want to remove the production tag from this prompt?
              </p>
              <p style={{ marginTop: '16px' }}>
                This will remove the <Badge><StarIcon style={{ fontSize: '12px', marginRight: '4px' }} />PROD</Badge> designation.
              </p>
            </>
          ) : (
            <>
              <p>
                <StarIcon style={{ marginRight: '8px', color: '#06c' }} />
                Mark this prompt as production-ready?
              </p>
              <p style={{ marginTop: '16px' }}>
                This will:
              </p>
              <ul style={{ marginTop: '8px', paddingLeft: '20px' }}>
                {hasGitRepo ? (
                  <>
                    <li>Create a pull request in the configured git repository</li>
                    <li>Add/update the production prompt file in the PR</li>
                    <li>Guide you to the PR for review and approval</li>
                    <li>Once merged, make the prompt accessible via the production API endpoint</li>
                  </>
                ) : (
                  <>
                    <li>Add the <Badge><StarIcon style={{ fontSize: '12px', marginRight: '4px' }} />PROD</Badge> tag to this prompt</li>
                    <li>Remove the production tag from any other prompt in this project</li>
                    <li>Move this prompt to the top of the history list</li>
                    <li>Make it accessible via the production API endpoint</li>
                  </>
                )}
              </ul>
            </>
          )}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button key="confirm" variant="primary" onClick={handleConfirm}>
          {isCurrentlyProd ? "Remove Tag" : hasGitRepo ? "Create Pull Request" : "Mark as Production"}
        </Button>
        <Button key="cancel" variant="link" onClick={onClose}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  );
};