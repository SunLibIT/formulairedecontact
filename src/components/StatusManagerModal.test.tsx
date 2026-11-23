// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_STATUSES, ROLE_LABEL, STATUS } from '../lib/schema';
import type { StatusDef } from '../lib/statuses';
import { StatusManagerModal } from './StatusManagerModal';

vi.mock('../lib/airtable', () => ({
  updateRecord: vi.fn(),
  updateRecords: vi.fn(),
  createRecord: vi.fn(),
  deleteRecord: vi.fn(),
}));
const airtable = await import('../lib/airtable');
const updateRecord = vi.mocked(airtable.updateRecord);
const updateRecords = vi.mocked(airtable.updateRecords);
const createRecord = vi.mocked(airtable.createRecord);
const deleteRecord = vi.mocked(airtable.deleteRecord);

const custom: StatusDef = {
  id: 'recCustom0000001',
  name: 'Rendez-vous fixé',
  color: '#db2777',
  order: 8,
  archived: false,
  role: null,
};

/** Choisit une option d'un menu du Kit (`ListeChoix`) : ouverture au clavier, choix au mousedown. */
function choisir(bouton: HTMLElement, libelle: string) {
  fireEvent.click(bouton, { detail: 0 });
  fireEvent.mouseDown(screen.getByRole('option', { name: libelle }), { button: 0 });
}

/** Hôte qui garde le registre, comme `useStatuses` : les écritures s'y cumulent. */
function Host({
  onReassign = vi.fn(async () => {}),
}: {
  onReassign?: (from: string, to: StatusDef) => Promise<void>;
}) {
  const [list, setList] = useState<StatusDef[]>([...DEFAULT_STATUSES, custom]);
  return (
    <>
      <StatusManagerModal
        statuses={list}
        usage={new Map([[custom.id, 4]])}
        loadError=""
        onChange={(change) => setList(change)}
        onReassign={onReassign}
        onClose={() => {}}
      />
      <output data-testid="names">{[...list].sort((a, b) => a.order - b.order).map((s) => s.name).join('|')}</output>
    </>
  );
}

/** Airtable renvoie la ligne écrite : on la reconstruit à partir des champs envoyés. */
function echo(base: StatusDef[] = [...DEFAULT_STATUSES, custom]) {
  updateRecord.mockImplementation(async (_t, id, fields) => {
    const s = base.find((x) => x.id === id)!;
    return {
      id,
      createdTime: '',
      fields: {
        [STATUS.name]: s.name,
        [STATUS.color]: s.color,
        [STATUS.order]: s.order,
        ...(s.role ? { [STATUS.role]: s.role } : {}),
        ...fields,
      },
    };
  });
}

const names = () => screen.getByTestId('names').textContent ?? '';

afterEach(() => {
  updateRecord.mockReset();
  updateRecords.mockReset();
  createRecord.mockReset();
  deleteRecord.mockReset();
});

describe('StatusManagerModal', () => {
  it('laisse tout statut s’archiver et se supprimer, rôle ou non', () => {
    render(<Host />);
    expect(screen.queryByText('Statut système')).toBeNull();
    expect(screen.getByRole('button', { name: 'Archiver Nouveau' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Supprimer Nouveau' })).toBeTruthy();
  });

  it('refuse un nom déjà pris, accents et casse ignorés, sans rien écrire', () => {
    render(<Host />);
    const input = screen.getByLabelText('Nom du statut Rendez-vous fixé');
    fireEvent.change(input, { target: { value: 'qualifie' } });
    fireEvent.blur(input);
    expect(screen.getByText('Un statut porte déjà ce nom.')).toBeTruthy();
    expect(updateRecord).not.toHaveBeenCalled();
  });

  it('enregistre le nom en quittant le champ', async () => {
    echo();
    render(<Host />);
    const input = screen.getByLabelText('Nom du statut Nouveau');
    fireEvent.change(input, { target: { value: 'Entrant' } });
    fireEvent.blur(input);
    await waitFor(() => expect(names()).toContain('Entrant'));
    expect(updateRecord).toHaveBeenCalledWith(expect.any(String), DEFAULT_STATUSES[0].id, {
      [STATUS.name]: 'Entrant',
    });
  });

  it('garde deux renommages successifs, sans que le second efface le premier', async () => {
    echo();
    render(<Host />);
    const a = screen.getByLabelText('Nom du statut Nouveau');
    fireEvent.change(a, { target: { value: 'Entrant' } });
    fireEvent.keyDown(a, { key: 'Enter' });
    await waitFor(() => expect(names()).toContain('Entrant'));
    const b = screen.getByLabelText('Nom du statut Qualifié');
    fireEvent.change(b, { target: { value: 'Retenu' } });
    fireEvent.keyDown(b, { key: 'Enter' });
    await waitFor(() => expect(names()).toContain('Retenu'));
    expect(names()).toContain('Entrant');
  });

  it('accepte une couleur libre saisie en hexadécimal', async () => {
    echo();
    render(<Host />);
    const hex = screen.getByLabelText('Couleur du statut Nouveau — code hexadécimal');
    fireEvent.change(hex, { target: { value: '#12AB9F' } });
    fireEvent.keyDown(hex, { key: 'Enter' });
    await waitFor(() =>
      expect(updateRecord).toHaveBeenCalledWith(expect.any(String), DEFAULT_STATUSES[0].id, {
        [STATUS.color]: '#12ab9f',
      }),
    );
  });

  it('déplace un rôle : il est retiré à celui qui le portait', async () => {
    echo();
    render(<Host />);
    const menus = screen.getAllByRole('button', { name: 'Rôle' });
    // Dernière ligne active : le statut ajouté.
    choisir(menus[DEFAULT_STATUSES.length], ROLE_LABEL.nouveau);
    await waitFor(() => expect(updateRecord).toHaveBeenCalledTimes(2));
    expect(updateRecord.mock.calls[0]).toEqual([
      expect.any(String),
      DEFAULT_STATUSES[0].id,
      { [STATUS.role]: null },
    ]);
    expect(updateRecord.mock.calls[1]).toEqual([
      expect.any(String),
      custom.id,
      { [STATUS.role]: 'nouveau' },
    ]);
  });

  it('exige une cible avant de supprimer un statut porté par des demandes, puis bascule et supprime', async () => {
    deleteRecord.mockResolvedValue(undefined);
    const onReassign = vi.fn(async () => {});
    render(<Host onReassign={onReassign} />);
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer Rendez-vous fixé' }));
    const confirm = screen.getByRole('button', { name: 'Supprimer' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(screen.getByText(/4 demandes le portent/)).toBeTruthy();

    choisir(screen.getByRole('button', { name: 'Statut de bascule' }), DEFAULT_STATUSES[2].name);
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(deleteRecord).toHaveBeenCalledWith(expect.any(String), custom.id));
    expect(onReassign).toHaveBeenCalledWith(
      custom.id,
      expect.objectContaining({ id: DEFAULT_STATUSES[2].id }),
    );
    expect(onReassign.mock.invocationCallOrder[0]).toBeLessThan(
      deleteRecord.mock.invocationCallOrder[0],
    );
    await waitFor(() => expect(names()).not.toContain('Rendez-vous fixé'));
  });

  it('ne supprime rien si la bascule échoue', async () => {
    const onReassign = vi.fn(async () => {
      throw new Error('2 demandes n’ont pas pu être basculées : suppression annulée.');
    });
    render(<Host onReassign={onReassign} />);
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer Rendez-vous fixé' }));
    choisir(screen.getByRole('button', { name: 'Statut de bascule' }), DEFAULT_STATUSES[2].name);
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(screen.getByText(/suppression annulée/)).toBeTruthy());
    expect(deleteRecord).not.toHaveBeenCalled();
  });

  it('crée un statut avec sa couleur, en fin de pipeline', async () => {
    createRecord.mockResolvedValue({
      id: 'recNew0000000001',
      createdTime: '',
      fields: { [STATUS.name]: 'À rappeler', [STATUS.color]: '#db2777', [STATUS.order]: 9 },
    });
    render(<Host />);
    fireEvent.change(screen.getByLabelText('Nom du nouveau statut'), {
      target: { value: 'À rappeler' },
    });
    const group = screen.getByRole('group', { name: 'Couleur du nouveau statut' });
    fireEvent.click(group.querySelector('[aria-label^="Rose"]')!);
    fireEvent.click(screen.getByRole('button', { name: /Ajouter/ }));

    await waitFor(() => expect(names()).toContain('À rappeler'));
    expect(createRecord).toHaveBeenCalledWith(expect.any(String), {
      [STATUS.name]: 'À rappeler',
      [STATUS.color]: '#db2777',
      [STATUS.order]: 9,
    });
  });

  it('monte un statut sans rien perdre : noms et couleurs restent, l’ordre est renuméroté', async () => {
    updateRecords.mockResolvedValue({ updated: 3, aborted: false, failed: [] });
    render(<Host />);
    const before = names().split('|');
    const i = before.indexOf('A relancer');
    fireEvent.click(screen.getByRole('button', { name: 'Monter A relancer' }));

    await waitFor(() => expect(names().split('|').indexOf('A relancer')).toBe(i - 1));
    expect(names().split('|').sort()).toEqual([...before].sort());
    expect(screen.getByLabelText('Nom du statut A relancer')).toBeTruthy();
    // Une seule requête groupée, et des numéros distincts 1, 2, 3…
    expect(updateRecords).toHaveBeenCalledTimes(1);
    const written = updateRecords.mock.calls[0][1].map((r) => r.fields[STATUS.order]);
    expect(new Set(written).size).toBe(written.length);
  });

  it('refuse une réponse indexée par nom plutôt que d’afficher un statut vide', async () => {
    // Ce qu'Airtable renvoie quand `returnFieldsByFieldId` est mal transmis.
    updateRecord.mockResolvedValue({
      id: 'rech6xrIebR7phhiF',
      createdTime: '',
      fields: { Nom: 'A relancer', Couleur: '#db2777' },
    });
    render(<Host />);
    const group = screen.getByRole('group', { name: 'Couleur du statut A relancer' });
    fireEvent.click(group.querySelector('[aria-label^="Rose"]')!);

    await waitFor(() => expect(screen.getByText(/réponse est illisible/)).toBeTruthy());
    expect(names()).toContain('A relancer');
    expect(names().split('|')).not.toContain('');
  });
});
