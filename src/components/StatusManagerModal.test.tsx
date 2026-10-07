// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_STATUSES, STATUS } from '../lib/schema';
import type { StatusDef } from '../lib/statuses';
import { StatusManagerModal } from './StatusManagerModal';

vi.mock('../lib/airtable', () => ({
  updateRecord: vi.fn(),
  createRecord: vi.fn(),
}));
const airtable = await import('../lib/airtable');
const updateRecord = vi.mocked(airtable.updateRecord);
const createRecord = vi.mocked(airtable.createRecord);

const custom: StatusDef = {
  id: 'recCustom0000001',
  name: 'Rendez-vous fixé',
  tone: 'signed',
  order: 8,
  archived: false,
  role: null,
};

function open(statuses: StatusDef[] = [...DEFAULT_STATUSES, custom], onChange = vi.fn()) {
  render(
    <StatusManagerModal
      statuses={statuses}
      usage={new Map([[custom.id, 4]])}
      loadError=""
      onChange={onChange}
      onClose={() => {}}
    />,
  );
  return onChange;
}

afterEach(() => {
  updateRecord.mockReset();
  createRecord.mockReset();
});

describe('StatusManagerModal', () => {
  it('ne propose pas d’archiver un statut système', () => {
    open();
    // Sept statuts d'origine, sept mentions ; seul le statut ajouté s'archive.
    expect(screen.getAllByText('Statut système')).toHaveLength(7);
    expect(screen.getAllByRole('button', { name: 'Archiver' })).toHaveLength(1);
  });

  it('refuse un nom déjà pris, accents et casse ignorés, sans rien écrire', () => {
    open();
    const input = screen.getByLabelText('Nom du statut Rendez-vous fixé');
    fireEvent.change(input, { target: { value: 'qualifie' } });
    fireEvent.blur(input);
    expect(screen.getByText('Un statut porte déjà ce nom.')).toBeTruthy();
    expect(updateRecord).not.toHaveBeenCalled();
  });

  it('renomme et remplace la ligne par celle renvoyée par Airtable', async () => {
    updateRecord.mockResolvedValue({
      id: custom.id,
      createdTime: '',
      fields: { [STATUS.name]: 'RDV fixé', [STATUS.tone]: 'signed', [STATUS.order]: 8 },
    });
    const onChange = open();
    const input = screen.getByLabelText('Nom du statut Rendez-vous fixé');
    fireEvent.change(input, { target: { value: 'RDV fixé' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(updateRecord).toHaveBeenCalledWith(expect.any(String), custom.id, {
      [STATUS.name]: 'RDV fixé',
    });
    const next = onChange.mock.calls[0][0] as StatusDef[];
    expect(next.find((s) => s.id === custom.id)?.name).toBe('RDV fixé');
  });

  it('demande confirmation avant d’archiver, en disant combien de demandes le gardent', async () => {
    updateRecord.mockResolvedValue({
      id: custom.id,
      createdTime: '',
      fields: { [STATUS.name]: custom.name, [STATUS.archived]: true },
    });
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Archiver' }));
    expect(updateRecord).not.toHaveBeenCalled();
    expect(screen.getByText(/4 demandes le gardent/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: "Confirmer l'archivage" }));
    await waitFor(() =>
      expect(updateRecord).toHaveBeenCalledWith(expect.any(String), custom.id, {
        [STATUS.archived]: true,
      }),
    );
  });

  it('montre le message d’Airtable quand l’écriture est refusée', async () => {
    updateRecord.mockRejectedValue(new Error('Gestion des statuts réservée aux groupes Direction et Administratif.'));
    open();
    // Recolorer « Nouveau » (vert) en rouge.
    fireEvent.click(screen.getAllByRole('radio', { name: 'Rouge' })[0]);
    await waitFor(() => expect(screen.getByText(/réservée aux groupes/)).toBeTruthy());
  });

  it('crée un statut avec le ton choisi, en fin de pipeline', async () => {
    createRecord.mockResolvedValue({
      id: 'recNew0000000001',
      createdTime: '',
      fields: { [STATUS.name]: 'À rappeler', [STATUS.tone]: 'action', [STATUS.order]: 9 },
    });
    const onChange = open();
    fireEvent.change(screen.getByLabelText('Nom du nouveau statut'), { target: { value: 'À rappeler' } });
    const group = screen.getByRole('radiogroup', { name: 'Couleur du nouveau statut' });
    fireEvent.click(group.querySelector('[aria-label="Ambre clair"]')!);
    fireEvent.click(screen.getByRole('button', { name: /Ajouter/ }));

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(createRecord).toHaveBeenCalledWith(expect.any(String), {
      [STATUS.name]: 'À rappeler',
      [STATUS.tone]: 'action',
      [STATUS.order]: 9,
    });
  });
});
