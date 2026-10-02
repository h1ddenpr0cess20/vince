import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { createHud } from '../../src/client/ui/hud.js';
import { loadPage } from '../helpers/dom.js';

describe('createHud', () => {
  let page;
  let hud;

  beforeEach(async () => {
    page = await loadPage();
    hud = createHud(page.document);
  });

  afterEach(() => page.close());

  it('finds every element it needs in the shipped markup', () => {
    for (const sel of ['#status', '#caption', '#you']) {
      assert.ok(page.$(sel), `${sel} is missing from index.html`);
    }
  });

  it('drives the status chip through both text and the state attribute', () => {
    hud.setState('speaking');
    assert.equal(page.$('#status').textContent, 'speaking');
    assert.equal(page.$('#status').dataset.state, 'speaking');
  });

  it('accepts the synthetic connecting state the CSS also styles', () => {
    hud.setState('connecting');
    assert.equal(page.$('#status').dataset.state, 'connecting');
  });

  it('shows and hides the line of what the person said', () => {
    hud.showUser('what are you?');
    assert.equal(page.$('#you').textContent, 'what are you?');
    assert.ok(page.$('#you').classList.contains('visible'));

    hud.hideUser();
    assert.ok(!page.$('#you').classList.contains('visible'));
    assert.equal(page.$('#you').textContent, 'what are you?');
  });

  it('appends caption chunks in order rather than replacing', () => {
    hud.appendCaption('Hello. ');
    hud.appendCaption('I am an ear.');
    assert.equal(page.$('#caption').textContent, 'Hello. I am an ear.');
    assert.ok(page.$('#caption').classList.contains('visible'));
  });

  it('renders text as text, never as markup', () => {
    hud.appendCaption('<img src=x onerror=alert(1)>');
    assert.equal(page.$('#caption').querySelector('img'), null);
    assert.equal(page.$('#caption').textContent, '<img src=x onerror=alert(1)>');
  });

  it('clears the caption and its error state together', () => {
    hud.showError('the call dropped');
    hud.clearCaption();
    const caption = page.$('#caption');
    assert.equal(caption.textContent, '');
    assert.ok(!caption.classList.contains('visible'));
    assert.ok(!caption.classList.contains('error'));
  });

  it('marks an error and drops the mark when normal text resumes', () => {
    hud.showError('the call dropped');
    assert.ok(page.$('#caption').classList.contains('error'));

    hud.appendCaption('Hello!');
    assert.ok(!page.$('#caption').classList.contains('error'));
  });

  it('replaces the previous error rather than appending to it', () => {
    hud.showError('first');
    hud.showError('second');
    assert.equal(page.$('#caption').textContent, 'second');
  });

  describe('the markdown the model was told not to use', () => {
    it('renders bold, emphasis and code as elements', () => {
      hud.appendCaption('A **big** _painted_ `ear`!');
      const caption = page.$('#caption');

      assert.equal(caption.querySelector('strong').textContent, 'big');
      assert.equal(caption.querySelector('em').textContent, 'painted');
      assert.equal(caption.querySelector('code').textContent, 'ear');
      assert.equal(caption.textContent, 'A big painted ear!');
    });

    it('nests one inside another', () => {
      hud.appendCaption('**very _very_ waxy**');
      assert.equal(page.$('#caption').querySelector('strong em').textContent, 'very');
    });

    it('formats a span whose halves arrive in different chunks', () => {
      hud.appendCaption('I am an **e');
      assert.equal(page.$('#caption').querySelector('strong'), null);

      hud.appendCaption('ar**!');
      assert.equal(page.$('#caption').querySelector('strong').textContent, 'ear');
      assert.equal(page.$('#caption').textContent, 'I am an ear!');
    });

    it('leaves ordinary prose punctuation alone', () => {
      hud.appendCaption('level_up_time costs 3 * 4 gold');
      const caption = page.$('#caption');

      assert.equal(caption.querySelector('em'), null);
      assert.equal(caption.textContent, 'level_up_time costs 3 * 4 gold');
    });

    it('keeps the line breaks the model sent', () => {
      hud.appendCaption('One thing.\n\nAnother thing.');
      assert.equal(page.$('#caption').textContent, 'One thing.\n\nAnother thing.');
    });

    it('still never produces markup, inside a span or out', () => {
      hud.appendCaption('**<img src=x onerror=alert(1)>** and `<b>bold</b>`');
      const caption = page.$('#caption');

      assert.equal(caption.querySelector('img'), null);
      assert.equal(caption.querySelector('b'), null);
      assert.equal(caption.querySelector('code').textContent, '<b>bold</b>');
    });

    it('starts each turn from an empty transcript', () => {
      hud.appendCaption('**first**');
      hud.clearCaption();
      hud.appendCaption('second');
      assert.equal(page.$('#caption').textContent, 'second');
    });
  });

  describe('the spoken row', () => {
    it('replaces the caption rather than repeating what grew', () => {
      hud.setCaption('I am');
      hud.setCaption('I am an ear.');
      assert.equal(page.$('#caption').textContent, 'I am an ear.');
      assert.ok(page.$('#caption').classList.contains('visible'));
    });

    it('drops the error state the way appending does', () => {
      hud.showError('the call dropped');
      hud.setCaption('back');
      assert.ok(!page.$('#caption').classList.contains('error'));
      assert.equal(page.$('#caption').textContent, 'back');
    });
  });

  describe('web sources', () => {
    const link = (url, title) => hud.showSource({ url, title });
    const shown = () => page.$$('.sources a').map((a) => a.textContent);

    it('lists each source once, as a link that opens away from the page', () => {
      link('https://example.com/a', 'A study');
      link('https://example.com/a', 'A study');
      assert.deepEqual(shown(), ['A study']);

      const anchor = page.$('.sources a');
      assert.equal(anchor.href, 'https://example.com/a');
      assert.equal(anchor.target, '_blank');
      assert.equal(anchor.rel, 'noopener noreferrer');
    });

    it('falls back to the host when the citation has no title', () => {
      link('https://news.example.org/piece', '');
      assert.deepEqual(shown(), ['news.example.org']);
    });

    it('refuses anything that is not a web address', () => {
      link('javascript:alert(1)', 'click me');
      link('not a url at all', 'nor this');
      assert.deepEqual(shown(), []);
    });

    it('sheds the oldest past the limit, and can show it again later', () => {
      for (let i = 0; i < 8; i += 1) link(`https://example.com/${i}`, `source ${i}`);
      assert.deepEqual(shown(), ['source 2', 'source 3', 'source 4', 'source 5', 'source 6', 'source 7']);

      /** Trimmed is not the same as cited: a later answer may cite it again. */
      link('https://example.com/0', 'source 0');
      assert.ok(shown().includes('source 0'));
    });

    it('goes with the answer it belongs to when the caption is cleared', () => {
      link('https://example.com/a', 'A study');
      hud.clearCaption();
      assert.deepEqual(shown(), []);

      link('https://example.com/a', 'A study');
      assert.deepEqual(shown(), ['A study']);
    });

    it('survives a caption that grows, which clears nothing', () => {
      link('https://example.com/a', 'A study');
      hud.setCaption('Well,');
      hud.setCaption('Well, it says this.');
      assert.deepEqual(shown(), ['A study']);
    });
  });
});
