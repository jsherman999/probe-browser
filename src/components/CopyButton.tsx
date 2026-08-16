import { useState } from 'react';
import Button from './Button';

interface CopyButtonProps {
  text: string;
  label?: string;
}

const CopyButton = ({ text, label = 'Copy' }: CopyButtonProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <Button
      onClick={handleCopy}
      variant={copied ? 'secondary' : 'primary'}
      aria-label={copied ? 'Copied!' : `Copy ${label}`}
    >
      {copied ? '✓ Copied!' : `📋 ${label}`}
    </Button>
  );
};

export default CopyButton;
