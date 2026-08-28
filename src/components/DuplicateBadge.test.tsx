// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { duplicateNote } from '../lib/leadActions';
import { DuplicateBadge } from './ui';

const note = duplicateNote({ email: 'a@b.fr', count: 3, rank: 2 });
const latest = duplicateNote({ email: 'a@b.fr', count: 3, rank: 1 });

describe('DuplicateBadge', () => {
  it('reste une simple mention sans action d’archivage', () => {
    render(<DuplicateBadge note={note} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('3 demandes')).toBeTruthy();
  });

  it('demande confirmation avant d’archiver', () => {
    const onArchive = vi.fn();
    render(<DuplicateBadge note={note} onArchive={onArchive} />);

    fireEvent.click(screen.getByRole('button', { name: /archiver cette demande/i }));
    // Le premier clic n'écrit rien : il ouvre la confirmation.
    expect(onArchive).not.toHaveBeenCalled();
    expect(screen.getByText(/Archiver/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /archiver cette demande/i }));
    expect(onArchive).toHaveBeenCalledTimes(1);
  });

  it('renonce sans rien écrire', () => {
    const onArchive = vi.fn();
    render(<DuplicateBadge note={note} onArchive={onArchive} />);
    fireEvent.click(screen.getByRole('button', { name: /archiver cette demande/i }));
    fireEvent.click(screen.getByRole('button', { name: /annuler/i }));
    expect(onArchive).not.toHaveBeenCalled();
    expect(screen.getByText('3 demandes')).toBeTruthy();
  });

  it('dit laquelle on archive quand c’est la plus récente', () => {
    // La pastille ne le dit qu'en couleur ; le libellé accessible, lui, le dit.
    render(<DuplicateBadge note={latest} onArchive={() => {}} />);
    expect(
      screen.getByRole('button', { name: /la plus récente des 3 demandes/i }),
    ).toBeTruthy();
  });

  it('signale l’échec au lieu de faire croire à un archivage', async () => {
    const onArchive = vi.fn().mockRejectedValue(new Error('Airtable a refusé'));
    render(<DuplicateBadge note={note} onArchive={onArchive} />);
    fireEvent.click(screen.getByRole('button', { name: /archiver cette demande/i }));
    fireEvent.click(screen.getByRole('button', { name: /archiver cette demande/i }));

    await waitFor(() => expect(screen.getByText('Échec')).toBeTruthy());
    expect(screen.getByRole('button').getAttribute('title')).toBe('Airtable a refusé');
  });

  it('n’ouvre pas la fiche derrière elle', () => {
    // La pastille vit dans une carte cliquable : sans arrêt de propagation,
    // confirmer un archivage ouvrirait la fiche par-dessus.
    const onOpen = vi.fn();
    render(
      <div onClick={onOpen}>
        <DuplicateBadge note={note} onArchive={() => {}} />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: /archiver cette demande/i }));
    expect(onOpen).not.toHaveBeenCalled();
  });
});
