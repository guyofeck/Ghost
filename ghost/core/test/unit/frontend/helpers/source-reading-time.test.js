const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Handlebars = require('handlebars');
const readingTime = require('../../../../core/frontend/helpers/reading_time');

// Render the real Source card with Ghost's reading-time calculation.
describe('Source home-page card reading time', function () {
    let render;
    let home;

    beforeEach(function () {
        home = true;
        const hbs = Handlebars.create();
        hbs.registerHelper('reading_time', readingTime);
        hbs.registerHelper('t', text => text);
        hbs.registerHelper('is', function (route, options) {
            return home ? options.fn(this) : options.inverse(this);
        });
        hbs.registerHelper('authors', () => 'Ghost');
        hbs.registerHelper('date', () => '2026-10-07');
        hbs.registerHelper('url', () => '/test/');
        hbs.registerHelper('post_class', () => 'post');
        hbs.registerHelper('img_url', image => image);
        render = hbs.compile(fs.readFileSync(path.join(__dirname, '../../../../content/themes/source/partials/post-card.hbs'), 'utf8'));
    });

    function card(html, custom = {}) {
        return render({title: 'Test post', slug: 'test', html, access: true}, {
            data: {custom: {show_author: true, show_publish_date: true, ...custom}}
        });
    }

    it('shows a one-minute minimum for a short post', function () {
        assert.match(card('<p>A short post.</p>'), /class="gh-card-reading-time">1 min read<\/span>/);
    });

    it('shows the calculated plural estimate for a longer post', function () {
        const html = `<p>${'word '.repeat(1100)}</p>`;
        assert.match(card(html), /class="gh-card-reading-time">4 min read<\/span>/);
    });

    it('shows reading time when author and publication date are hidden', function () {
        const output = card('<p>A short post.</p>', {show_author: false, show_publish_date: false});
        assert.match(output, /class="gh-card-reading-time">1 min read<\/span>/);
        assert.doesNotMatch(output, /class="gh-card-author"|class="gh-card-date"/);
    });

    it('does not change cards outside the home page', function () {
        home = false;
        assert.doesNotMatch(card('<p>A short post.</p>'), /gh-card-reading-time/);
    });
});
