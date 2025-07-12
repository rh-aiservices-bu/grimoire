import React, { useState } from 'react';
import {
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
  MenuToggleElement,
  Avatar,
} from '@patternfly/react-core';
import { UserIcon, SignOutAltIcon } from '@patternfly/react-icons';
import { AppUser } from '../types';

interface UserMenuProps {
  user: AppUser;
  onLogout: () => void;
}

export const UserMenu: React.FC<UserMenuProps> = ({ user, onLogout }) => {
  const [isOpen, setIsOpen] = useState(false);

  const onToggleClick = () => {
    setIsOpen(!isOpen);
  };

  const onSelect = () => {
    setIsOpen(false);
  };

  // Generate a simple avatar from user initials
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Dropdown
      isOpen={isOpen}
      onSelect={onSelect}
      onOpenChange={(isOpen: boolean) => setIsOpen(isOpen)}
      toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
        <MenuToggle
          ref={toggleRef}
          onClick={onToggleClick}
          isExpanded={isOpen}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            border: 'none',
            background: 'transparent',
          }}
        >
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: 'var(--pf-global--primary-color--100)',
              color: 'white',
              fontSize: '12px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {getInitials(user.name)}
          </div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontWeight: 'bold', margin: 0, fontSize: '14px' }}>
              {user.name}
            </div>
            <div style={{ color: 'var(--pf-global--Color--200)', margin: 0, fontSize: '11px' }}>
              {user.email}
            </div>
          </div>
        </MenuToggle>
      )}
    >
      <DropdownList>
        <DropdownItem key="profile" icon={<UserIcon />}>
          Profile Settings
        </DropdownItem>
        <DropdownItem key="logout" icon={<SignOutAltIcon />} onClick={onLogout}>
          Sign Out
        </DropdownItem>
      </DropdownList>
    </Dropdown>
  );
};