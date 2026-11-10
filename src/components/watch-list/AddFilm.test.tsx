// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AddFilm } from './AddFilm';
const mocks = vi.hoisted(() => ({ refresh: vi.fn(), existing: vi.fn(), add: vi.fn(), toast: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('@/app/actions/watch-list', () => ({ addToWatchList: mocks.existing }));
vi.mock('@/app/actions/add-film', () => ({ addFilm: mocks.add }));
vi.mock('@/components/marks/MarksProvider', () => ({ useFilmMarkValue: () => ({ want: false, watched: false }) }));
vi.mock('@/components/toast/Toaster', () => ({ showToast: mocks.toast }));
const local = { id: 1, slug: 'local', title: 'Local film', year: 2020, flag: null, originalTitle: null, categories: [], stage: null };
const source = (title: string, tmdbId = 5) => ({ tmdbId, title, year: 2030, originalTitle: null, overview: 'Film overview.' });
const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body)));
const fetchMock = vi.fn();
const box = () => screen.getByRole('combobox', { name: 'Add a film' });
const type = (value: string) => fireEvent.change(box(), { target: { value } });
beforeEach(() => {
 vi.clearAllMocks(); vi.stubGlobal('fetch', fetchMock);
 fetchMock.mockImplementation((url: string) => url.startsWith('/api/search') ? json({ films: [], awards: [] }) : json({ ok: true, value: { films: [source('New film')], page: 1, nextPage: null } }));
});
afterEach(() => vi.unstubAllGlobals());

it('offers both paths even when the local search has a match, and cancels without writing', async () => {
 fetchMock.mockImplementation(() => json({ films: [local], awards: [] }));
 render(<AddFilm />); fireEvent.focus(box()); type('Local');
 await screen.findByRole('option');
 expect(screen.getByRole('button', { name: 'Search more films' })).toBeTruthy();
 fireEvent.click(screen.getByRole('button', { name: 'Add manually' }));
 expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Local');
 fireEvent.keyDown(screen.getByLabelText('Release or planned year'), { key: 'Escape' });
 expect(document.activeElement).toBe(box());
 expect((box() as HTMLInputElement).value).toBe('Local');
 expect(screen.queryByRole('region', { name: 'Add manually' })).toBeNull();
 expect(mocks.add).not.toHaveBeenCalled();
});

it('Enter from no match opens TMDB; Enter picks, then Enter can save, keeping the sort', async () => {
 window.history.replaceState({}, '', '/watch-list?sort=average');
 mocks.add.mockResolvedValue({ ok: true, film: { id: 7, slug: 'new', title: 'New film', year: 2030 }, created: true, refreshRequired: false });
 render(<AddFilm />); fireEvent.focus(box()); type('New');
 await screen.findByText('No film called “New” in the app yet.');
 fireEvent.keyDown(box(), { key: 'Enter' }); await screen.findByRole('option');
 fireEvent.keyDown(box(), { key: 'Enter' });
 const save = screen.getByRole('button', { name: 'Add to Want to watch' });
 expect(document.activeElement).toBe(save); fireEvent.click(save);
 await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
 expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ action: { label: 'Open film', href: '/movies/new' }, description: 'Added to Want to watch.' }));
 expect(document.activeElement).toBe(box());
 expect((box() as HTMLInputElement).value).toBe('');
});

it('a delayed old source response cannot replace or select the current query', async () => {
 let old!: (result: Response) => void;
 fetchMock.mockImplementation((url: string) => url.startsWith('/api/search') ? json({ films: [], awards: [] }) : url.includes('q=old') ? new Promise((resolve) => { old = resolve; }) : json({ ok: true, value: { films: [source('Current')], page: 1, nextPage: null } }));
 render(<AddFilm />); fireEvent.focus(box()); type('old');
 fireEvent.click(screen.getByRole('button', { name: 'Search more films' }));
 await waitFor(() => expect(old).toBeTypeOf('function'));
 type('current');
 fireEvent.keyDown(box(), { key: 'Enter' });
 expect(screen.queryByRole('button', { name: 'Add to Want to watch' })).toBeNull();
 await screen.findByRole('option', { name: /Current/ });
 old(new Response(JSON.stringify({ ok: true, value: { films: [source('Old')], page: 1, nextPage: null } })));
 await waitFor(() => expect(screen.queryByRole('option', { name: /Old/ })).toBeNull());
 fireEvent.keyDown(box(), { key: 'Enter' });
 expect(screen.getByRole('heading', { name: 'Current' })).toBeTruthy();
});

it.each(['refused', 'timeout', 'rate-limited'])('source %s is distinct from empty and leaves the manual draft usable', async (error) => {
 fetchMock.mockImplementation((url: string) => url.startsWith('/api/search') ? json({ films: [], awards: [] }) : json({ ok: false, error }));
 render(<AddFilm />); fireEvent.focus(box()); type('Preserved');
 fireEvent.click(screen.getByRole('button', { name: 'Search more films' }));
 await screen.findByRole('alert');
 expect(screen.queryByText(/No film called.*on TMDB/)).toBeNull();
 expect(!!screen.queryByRole('button', { name: 'Try again' })).toBe(error !== 'refused');
 fireEvent.click(screen.getByRole('button', { name: 'Add manually' }));
 expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Preserved');
});

it('keeps the manual title and Add a film box together as the draft is edited', async () => {
 render(<AddFilm />); fireEvent.focus(box()); type('First draft');
 fireEvent.click(screen.getByRole('button', { name: 'Add manually' }));
 fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Revised draft' } });
 expect((box() as HTMLInputElement).value).toBe('Revised draft');
 fireEvent.keyDown(screen.getByLabelText('Release or planned year'), { key: 'Escape' });
 expect((box() as HTMLInputElement).value).toBe('Revised draft');
 expect(mocks.add).not.toHaveBeenCalled();
});

it('moves the single active source result with the pointer and names the confirmation after picking', async () => {
 fetchMock.mockImplementation((url: string) => url.startsWith('/api/search') ? json({ films: [], awards: [] }) : json({ ok: true, value: { films: [source('First', 1), source('Second', 2)], page: 1, nextPage: null } }));
 render(<AddFilm />); fireEvent.focus(box()); type('films');
 fireEvent.click(screen.getByRole('button', { name: 'Search more films' }));
 const options = await screen.findAllByRole('option');
 fireEvent.pointerMove(options[1]);
 expect(options.map((option) => option.getAttribute('aria-selected'))).toEqual(['false', 'true']);
 fireEvent.keyDown(box(), { key: 'Enter' });
 expect(screen.getByRole('heading', { name: 'Add to Want to watch' })).toBeTruthy();
 expect(screen.getByRole('heading', { name: 'Second' })).toBeTruthy();
 expect(screen.queryByText('Films from TMDB. Pick yours by its title and year.')).toBeNull();
});
