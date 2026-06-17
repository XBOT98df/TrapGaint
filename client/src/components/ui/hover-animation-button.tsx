import React from 'react';
import styled from 'styled-components';

interface HoverAnimationButtonProps {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  disabled?: boolean;
  variant?: 'default' | 'green';
}

const HoverAnimationButton = ({ children, onClick, className, disabled, variant = 'default' }: HoverAnimationButtonProps) => {
  return (
    <StyledWrapper className={className} $variant={variant}>
      <button className="btn" onClick={onClick} disabled={disabled}>
        <span className="btn-text">{children}</span>
      </button>
    </StyledWrapper>
  );
}

const StyledWrapper = styled.div<{ $variant: 'default' | 'green' }>`
  .btn {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    padding: 0.75rem 2.5rem;
    border-radius: 99rem;
    border: 2px solid ${props => props.$variant === 'green' ? '#10b981' : 'rgba(255,255,255,0.3)'};
    background: ${props => props.$variant === 'green' ? '#10b981' : 'transparent'};
    color: #fff;
    font-family: 'Outfit', system-ui, sans-serif;
    font-size: 1rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    cursor: pointer;
    overflow: hidden;
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .btn:disabled {
    cursor: default;
    opacity: 0.5;
  }

  .btn::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: ${props => props.$variant === 'green' ? '#059669' : '#fff'};
    transform: scaleX(0);
    transform-origin: right;
    transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 0;
  }

  .btn:hover::before {
    transform: scaleX(1);
    transform-origin: left;
  }

  .btn-text {
    position: relative;
    z-index: 1;
    transition: color 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .btn:hover .btn-text {
    color: ${props => props.$variant === 'green' ? '#fff' : '#000'};
  }

  .btn:hover {
    border-color: ${props => props.$variant === 'green' ? '#059669' : '#fff'};
    ${props => props.$variant !== 'green' && 'box-shadow: 0 0 20px rgba(255,255,255,0.15);'}
  }

  .btn:active {
    transform: scale(0.98);
  }
`;

export default HoverAnimationButton;
