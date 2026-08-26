// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ViewSwitcher } from './ViewSwitcher';

describe('ViewSwitcher', () => {
  it('expose un groupe de boutons radio, pas deux boutons indépendants', () => {
    render(<ViewSwitcher value="cards" onChange={() => {}} />);
    // Les deux options sont exclusives : un lecteur d'écran doit l'entendre.
    expect(screen.getByRole('radiogroup')).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('marque l’option active autrement que par la couleur', () => {
    render(<ViewSwitcher value="list" onChange={() => {}} />);
    const [list, cards] = screen.getAllByRole('radio');
    expect(list.getAttribute('aria-checked')).toBe('true');
    expect(cards.getAttribute('aria-checked')).toBe('false');
    // Le libellé accessible énonce la sélection : un lecteur d'écran ne voit
    // pas le fond teinté.
    expect(list.getAttribute('aria-label')).toContain('sélectionnée');
    expect(cards.getAttribute('aria-label')).not.toContain('sélectionnée');
  });

  it('ne place qu’un seul bouton dans l’ordre de tabulation', () => {
    render(<ViewSwitcher value="cards" onChange={() => {}} />);
    const tabbable = screen
      .getAllByRole('radio')
      .filter((el) => el.getAttribute('tabindex') === '0');
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0].getAttribute('aria-checked')).toBe('true');
  });

  it('remonte le choix au clic', () => {
    const onChange = vi.fn();
    render(<ViewSwitcher value="cards" onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: /liste/i }));
    expect(onChange).toHaveBeenCalledWith('list');
  });

  it('navigue aux flèches, dans les deux sens', () => {
    const onChange = vi.fn();
    const { rerender } = render(<ViewSwitcher value="list" onChange={onChange} />);

    fireEvent.keyDown(screen.getAllByRole('radio')[0], { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('cards');

    rerender(<ViewSwitcher value="cards" onChange={onChange} />);
    fireEvent.keyDown(screen.getAllByRole('radio')[1], { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith('list');
  });

  it('boucle en fin de groupe', () => {
    const onChange = vi.fn();
    render(<ViewSwitcher value="cards" onChange={onChange} />);
    // « cards » est la dernière option : avancer revient à la première.
    fireEvent.keyDown(screen.getAllByRole('radio')[1], { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('list');
  });

  it('accepte aussi les flèches verticales', () => {
    const onChange = vi.fn();
    render(<ViewSwitcher value="list" onChange={onChange} />);
    fireEvent.keyDown(screen.getAllByRole('radio')[0], { key: 'ArrowDown' });
    expect(onChange).toHaveBeenLastCalledWith('cards');
  });

  it('porte un libellé de groupe explicite', () => {
    render(<ViewSwitcher value="cards" onChange={() => {}} />);
    expect(screen.getByRole('radiogroup').getAttribute('aria-label')).toBeTruthy();
  });
});
