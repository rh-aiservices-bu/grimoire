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
      title={isCurrentlyProd ? "Create Production PR" : "Mark as Test"}
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
                <StarIcon style={{ marginRight: '8px', color: '#06c' }} />
                Create a production pull request for this prompt?
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
                    <li>Mark this prompt as production-ready</li>
                    <li>Move it to the production view</li>
                    <li>Make it accessible via the production API endpoint</li>
                  </>
                )}
              </ul>
            </>
          ) : (
            <>
              <p>
                <StarIcon style={{ marginRight: '8px', color: '#06c' }} />
                Mark this prompt as test-ready?
              </p>
              <p style={{ marginTop: '16px' }}>
                This will:
              </p>
              <ul style={{ marginTop: '8px', paddingLeft: '20px' }}>
                {hasGitRepo ? (
                  <>
                    <li>Save the test settings to the configured git repository</li>
                    <li>Create a git commit with the test configuration</li>
                    <li>Make the test settings available for backend testing</li>
                    <li>Enable the Prod button for creating production PRs</li>
                  </>
                ) : (
                  <>
                    <li>Add the <Badge><StarIcon style={{ fontSize: '12px', marginRight: '4px' }} />TEST</Badge> tag to this prompt</li>
                    <li>Remove the test tag from any other prompt in this project</li>
                    <li>Move this prompt to the top of the history list</li>
                    <li>Enable the Prod button for production deployment</li>
                  </>
                )}
              </ul>
            </>
          )}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button key="confirm" variant="primary" onClick={handleConfirm}>
          {isCurrentlyProd ? (hasGitRepo ? "Create Pull Request" : "Mark as Production") : (hasGitRepo ? "Save Test Settings to Git" : "Mark as Test")}
        </Button>
        <Button key="cancel" variant="link" onClick={onClose}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  );
};