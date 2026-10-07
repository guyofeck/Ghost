import sinon from 'sinon';
import {authenticateSession} from 'ember-simple-auth/test-support';
import {beforeEach, describe, it} from 'mocha';
import {click, currentURL, find, findAll, visit} from '@ember/test-helpers';
import {expect} from 'chai';
import {setupApplicationTest} from 'ember-mocha';
import {setupMirage} from 'ember-cli-mirage/test-support';

describe('Acceptance: Copy post link', function () {
    const hooks = setupApplicationTest();
    setupMirage(hooks);

    beforeEach(async function () {
        this.server.loadFixtures('configs');
        this.server.loadFixtures('settings');
        const role = this.server.create('role', {name: 'Administrator'});
        const user = this.server.create('user', {roles: [role]});
        this.post = this.server.create('post', {authors: [user], status: 'published'});
        await authenticateSession();
    });

    this.afterEach(function () {
        sinon.restore();
    });

    it('only shows Copy link for published posts', async function () {
        this.server.create('post', {status: 'draft'});
        this.server.create('post', {status: 'scheduled'});
        this.server.create('post', {status: 'sent'});
        await visit('/posts');

        expect(findAll('[data-test-copy-post-link]')).to.have.length(1);
        expect(find(`[data-test-post-id="${this.post.id}"] [data-test-copy-post-link]`)).to.contain.text('Copy link');
    });

    it('copies the public URL without navigating or selecting the row', async function () {
        const writeText = sinon.stub(navigator.clipboard, 'writeText').resolves();
        await visit('/posts');
        await click('[data-test-copy-post-link]', {ctrlKey: true});

        expect(writeText.calledOnceWithExactly(`http://localhost:4200/${this.post.slug}/`)).to.be.true;
        expect(currentURL()).to.equal('/posts');
        expect(find('.gh-posts-list-item-group[data-selected]')).to.not.exist;
        expect(find('[data-test-text="notification-content"]')).to.contain.text('Post link copied');
    });

    it('reports clipboard failure and allows retry', async function () {
        const writeText = sinon.stub(navigator.clipboard, 'writeText').rejects(new Error('Clipboard denied'));
        await visit('/posts');
        await click('[data-test-copy-post-link]');

        expect(find('[data-test-copy-post-link]').disabled).to.be.false;
        expect(find('[data-test-text="notification-content"]')).to.contain.text('Could not copy post link');
        expect(currentURL()).to.equal('/posts');

        writeText.resolves();
        await click('[data-test-copy-post-link]');
        expect(writeText.calledTwice).to.be.true;
        expect(findAll('[data-test-text="notification-content"]').some(element => element.textContent.includes('Post link copied'))).to.be.true;
    });
});
