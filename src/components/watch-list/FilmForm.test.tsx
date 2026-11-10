// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { FilmForm } from './FilmForm';

const addFilm = vi.hoisted(() => vi.fn());
vi.mock('@/app/actions/add-film', () => ({ addFilm }));
const onSaved = vi.fn();
const props = { film: null, initialTitle: 'A missing film', onBack: vi.fn(), onBusy: vi.fn(), onSaved };
const success = { ok: true, created: true, refreshRequired: false, film: { id: 7, title: 'A missing film', year: 2030, slug: 'missing' } };
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Add to Want to watch' }));
const year = () => screen.getByLabelText('Release or planned year');
beforeEach(() => { vi.clearAllMocks(); addFilm.mockReset(); });

it('validates empty titles and years without sending a save, and focuses the invalid field', async () => {
  render(<FilmForm {...props} initialTitle=" " />);
  expect(document.activeElement).toBe(year());
  save();
  expect(screen.getByText("Type the film's title.")).toBeTruthy();
  expect(screen.getByText('Type a year from 1800 to 9999.')).toBeTruthy();
  expect(document.activeElement).toBe(screen.getByLabelText('Title'));
  expect(addFilm).not.toHaveBeenCalled();
});

it('keeps the identity and draft on retry, rotates identity on editing after a failed save', async () => {
  addFilm.mockResolvedValue({ ok: false, reason: 'failed' });
  render(<FilmForm {...props} />);
  fireEvent.change(year(), { target: { value: '2030' } }); save();
  await screen.findByRole('alert');
  const first = addFilm.mock.calls[0][0];
  expect(onSaved).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(addFilm).toHaveBeenCalledTimes(2));
  expect(addFilm.mock.calls[1][0]).toEqual(first);
  await screen.findByRole('alert');
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Edited film' } }); save();
  await waitFor(() => expect(addFilm).toHaveBeenCalledTimes(3));
  expect(addFilm.mock.calls[2][0].localId).not.toBe(first.localId);
});

it('blocks double submission and pauses all save/close inputs while a save is uncertain', async () => {
  let finish!: (result: typeof success) => void;
  addFilm.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  render(<FilmForm {...props} />);
  fireEvent.change(year(), { target: { value: '2030' } });
  save(); save();
  expect(addFilm).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Cancel' }).hasAttribute('disabled')).toBe(true);
  expect(year().hasAttribute('readonly')).toBe(true);
  finish(success);
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(success));
});

it.each(['Use this film', 'Add a different film'])('requires the explicit duplicate choice: %s', async (choice) => {
  addFilm.mockResolvedValueOnce({ ok: false, reason: 'duplicate', matches: [success.film] }).mockResolvedValue(success);
  render(<FilmForm {...props} />);
  fireEvent.change(year(), { target: { value: '2030' } }); save();
  await screen.findByRole('radiogroup');
  expect(onSaved).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: choice }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(addFilm.mock.calls[1][0].duplicate).toEqual(choice === 'Use this film' ? { kind: 'use', movieId: 7 } : { kind: 'different' });
  expect(addFilm.mock.calls[1][0].localId).toBe(addFilm.mock.calls[0][0].localId);
});

it('requests a missing source year and sends only the verified source ID plus that year', async () => {
  addFilm.mockResolvedValue(success);
  render(<FilmForm {...props} film={{ tmdbId: 123, title: 'Undated', originalTitle: null, year: null, overview: '' }} />);
  save(); expect(addFilm).not.toHaveBeenCalled();
  fireEvent.change(year(), { target: { value: '2099' } }); save();
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(addFilm.mock.calls[0][0]).toEqual({ kind: 'catalogue', localId: expect.any(String), tmdbId: 123, year: 2099 });
});

it('identity conflicts provide a back action without offering another save', async () => {
  addFilm.mockResolvedValue({ ok: false, reason: 'identity-conflict' });
  render(<FilmForm {...props} film={{ tmdbId: 123, title: 'Conflict', originalTitle: null, year: 2020, overview: '' }} />);
  save(); await screen.findByRole('alert');
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Back to results' })).toBeTruthy();
});

it('asks again if the source date disappears between search and save', async () => {
  addFilm.mockResolvedValueOnce({ ok: false, reason: 'missing-year' }).mockResolvedValue(success);
  render(<FilmForm {...props} film={{ tmdbId: 123, title: 'Date changed', originalTitle: null, year: 2030, overview: '' }} />);
  save();
  await screen.findByLabelText('Release or planned year');
  expect(document.activeElement).toBe(year());
  fireEvent.change(year(), { target: { value: '2031' } }); save();
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(addFilm.mock.calls[1][0].year).toBe(2031);
});
