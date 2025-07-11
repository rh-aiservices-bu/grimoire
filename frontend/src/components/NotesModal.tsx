import React, { useState, useEffect } from 'react';
import {
  Modal,
  ModalVariant,
  Button,
  Form,
  FormGroup,
  TextArea,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from '@patternfly/react-core';

interface NotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (notes: string) => void;
  initialNotes: string;
}

export const NotesModal: React.FC<NotesModalProps> = ({ 
  isOpen, 
  onClose, 
  onSave, 
  initialNotes 
}) => {
  const [notes, setNotes] = useState(initialNotes);

  useEffect(() => {
    setNotes(initialNotes);
  }, [initialNotes]);

  const handleSave = () => {
    onSave(notes);
    onClose();
  };

  const handleClose = () => {
    setNotes(initialNotes); // Reset on cancel
    onClose();
  };

  return (
    <Modal
      variant={ModalVariant.medium}
      title="Notes"
      isOpen={isOpen}
      onClose={handleClose}
    >
      <ModalHeader />
      <ModalBody>
        <Form>
          <FormGroup label="Notes" fieldId="notes">
            <TextArea
              id="notes"
              name="notes"
              value={notes}
              onChange={(_event, value) => setNotes(value)}
              rows={8}
              placeholder="Add your notes about this experiment..."
            />
          </FormGroup>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button key="save" variant="primary" onClick={handleSave}>
          Save Notes
        </Button>
        <Button key="cancel" variant="link" onClick={handleClose}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  );
};