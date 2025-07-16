import { render, screen } from '@testing-library/react';
import App from './App';

// Mock the API module
jest.mock('./api', () => ({
  api: {
    getProjects: jest.fn().mockResolvedValue([]),
    getCurrentGitUser: jest.fn().mockRejectedValue(new Error('No user')),
  },
}));

describe('App', () => {
  it('renders without crashing', () => {
    render(<App />);
    expect(screen.getByText('Loading projects...')).toBeInTheDocument();
  });
});