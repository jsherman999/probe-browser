import { useState } from 'react';
import Button from '../components/Button';
import Modal from '../components/Modal';
import Card from '../components/Card';

const GameRules = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button variant="secondary" onClick={() => setIsOpen(true)} aria-label="View game rules">
        How to Play
      </Button>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="How to Play Probe"
      >
        <div className="space-y-4">
          <Card>
            <h3 className="text-lg font-bold text-accent mb-2">📝 Setup</h3>
            <ul className="space-y-2 text-gray-300">
              <li>• 2-4 players join the same game room</li>
              <li>• Each player secretly selects a word (4-12 letters)</li>
              <li>• Game begins when all players have chosen their words</li>
            </ul>
          </Card>

          <Card>
            <h3 className="text-lg font-bold text-accent mb-2">🎯 Gameplay</h3>
            <ul className="space-y-2 text-gray-300">
              <li>• Players take turns guessing letters in opponents' words</li>
              <li>• Choose a letter and select which player to probe</li>
              <li>• If the letter is in their word, all instances are revealed</li>
              <li>• Earn points equal to: (letter value) × (number of occurrences)</li>
            </ul>
          </Card>

          <Card>
            <h3 className="text-lg font-bold text-accent mb-2">⭐ Scoring</h3>
            <div className="grid grid-cols-2 gap-2 text-sm text-gray-300">
              <div><strong>1 pt:</strong> E, A, I, O, N, R, T, L, S, U</div>
              <div><strong>2 pts:</strong> D, G</div>
              <div><strong>3 pts:</strong> B, C, M, P</div>
              <div><strong>4 pts:</strong> F, H, V, W, Y</div>
              <div><strong>5 pts:</strong> K</div>
              <div><strong>8 pts:</strong> J, X</div>
              <div><strong>10 pts:</strong> Q, Z</div>
            </div>
          </Card>

          <Card>
            <h3 className="text-lg font-bold text-accent mb-2">🏆 Winning</h3>
            <ul className="space-y-2 text-gray-300">
              <li>• Continue your turn if you guess correctly</li>
              <li>• Turn passes to next player on incorrect guess</li>
              <li>• When your word is completely revealed, you're eliminated</li>
              <li>• Last player remaining wins!</li>
              <li>• Highest score wins if all words are revealed</li>
            </ul>
          </Card>

          <Card>
            <h3 className="text-lg font-bold text-accent mb-2">💡 Strategy Tips</h3>
            <ul className="space-y-2 text-gray-300">
              <li>• Start with common letters (E, A, R, S, T)</li>
              <li>• Target players with longer words for more points</li>
              <li>• Save high-value letters for when you have clues</li>
              <li>• Choose obscure words to avoid early elimination</li>
            </ul>
          </Card>
        </div>
      </Modal>
    </>
  );
};

export default GameRules;
