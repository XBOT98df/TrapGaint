import React from 'react';
import styled from 'styled-components';

interface AnimatedSwitchProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const AnimatedSwitch: React.FC<AnimatedSwitchProps> = ({ 
  checked = false, 
  onChange, 
  disabled = false,
  size = 'md'
}) => {
  const id = React.useId();
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onChange && !disabled) {
      onChange(e.target.checked);
    }
  };

  return (
    <StyledWrapper $size={size}>
      <div>
        <input 
          id={id}
          type="checkbox" 
          checked={checked}
          onChange={handleChange}
          disabled={disabled}
        />
        <label className="switch" htmlFor={id}>
          <svg viewBox="0 0 212.4992 84.4688" overflow="visible">
            <path 
              pathLength={360} 
              fill="none" 
              stroke="currentColor" 
              d="M 42.2496 0 A 42.24 42.24 90 0 0 0 42.2496 A 42.24 42.24 90 0 0 42.2496 84.4688 A 42.24 42.24 90 0 0 84.4992 42.2496 A 42.24 42.24 90 0 0 42.2496 0 A 42.24 42.24 90 0 0 0 42.2496 A 42.24 42.24 90 0 0 42.2496 84.4688 L 170.2496 84.4688 A 42.24 42.24 90 0 0 212.4992 42.2496 A 42.24 42.24 90 0 0 170.2496 0 A 42.24 42.24 90 0 0 128 42.2496 A 42.24 42.24 90 0 0 170.2496 84.4688 A 42.24 42.24 90 0 0 212.4992 42.2496 A 42.24 42.24 90 0 0 170.2496 0 L 42.2496 0" 
            />
          </svg>
        </label>
      </div>
    </StyledWrapper>
  );
};

const StyledWrapper = styled.div<{ $size: 'sm' | 'md' | 'lg' }>`
  /* Size variants */
  ${props => {
    switch (props.$size) {
      case 'sm':
        return `
          .switch {
            height: 0.75em;
          }
        `;
      case 'lg':
        return `
          .switch {
            height: 1.5em;
          }
        `;
      default:
        return `
          .switch {
            height: 1em;
          }
        `;
    }
  }}

  /* The switch - the box around the slider */
  .switch {
    --a: 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    cursor: pointer;
    position: relative;
    display: inline-flex;
    border-radius: 2em;
    box-shadow: 0 0 0 0.2em rgba(170, 170, 170, 0.3);
    aspect-ratio: 212.4992/84.4688;
    background-color: #3f3f46;
    transition: all var(--a);
  }

  /* Hide default HTML checkbox */
  input[type="checkbox"] {
    opacity: 0;
    width: 0;
    height: 0;
    position: absolute;
  }

  .switch svg {
    height: 100%;
  }

  .switch svg path {
    color: #71717a;
    stroke-width: 16;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 136 224;
    transition: all var(--a);
    transform-origin: center;
  }

  /* Checked state */
  input[type="checkbox"]:checked + .switch {
    background-color: #22c55e;
    box-shadow: 0 0 0 0.2em rgba(34, 197, 94, 0.3);
  }

  input[type="checkbox"]:checked + .switch svg path {
    color: #fff;
    stroke-dashoffset: 180;
    transform: scaleY(-1);
  }

  /* Disabled state */
  input[type="checkbox"]:disabled + .switch {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Hover state */
  input[type="checkbox"]:not(:disabled) + .switch:hover {
    box-shadow: 0 0 0 0.3em rgba(170, 170, 170, 0.4);
  }

  input[type="checkbox"]:checked:not(:disabled) + .switch:hover {
    box-shadow: 0 0 0 0.3em rgba(34, 197, 94, 0.4);
  }
`;

export default AnimatedSwitch;
