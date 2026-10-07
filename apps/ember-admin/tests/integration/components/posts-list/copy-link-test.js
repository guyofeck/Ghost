import hbs from 'htmlbars-inline-precompile';
import sinon from 'sinon';
import {click, find, render} from '@ember/test-helpers';
import {describe, it} from 'mocha';
import {expect} from 'chai';
import {setupRenderingTest} from 'ember-mocha';

const button = '[data-test-button="copy-post-link"]';

describe('Integration: Component: posts-list/copy-link', function () {
    setupRenderingTest();

    afterEach(function () {
        sinon.restore();
    });

    it('only renders for published posts with a public URL', async function () {
        for (const post of [
            {isPublished: false, status: 'draft', url: 'https://example.com/draft/'},
            {isPublished: false, status: 'scheduled', url: 'https://example.com/scheduled/'},
            {isPublished: false, status: 'sent', url: 'https://example.com/sent/'},
            {isPublished: true, url: null}
        ]) {
            this.set('post', post);
            await render(hbs`<PostsList::CopyLink @post={{this.post}} />`);
            expect(find(button)).to.not.exist;
        }

        this.set('post', {isPublished: true, url: 'https://example.com/published/'});
        await render(hbs`<PostsList::CopyLink @post={{this.post}} />`);
        expect(find(button)).to.contain.text('Copy link');
        expect(find(button)).to.have.attr('data-ignore-select');
    });

    it('copies the public URL and confirms success without bubbling the click', async function () {
        const url = 'https://example.com/custom-route/published/';
        const writeText = sinon.stub(navigator.clipboard, 'writeText').resolves();
        const notifications = this.owner.lookup('service:notifications');
        const notify = sinon.stub(notifications, 'showNotification');
        const rowClick = sinon.spy();
        this.set('rowClick', rowClick);
        this.set('post', {isPublished: true, url});

        await render(hbs`<div {{on "click" this.rowClick}}><PostsList::CopyLink @post={{this.post}} /></div>`);
        await click(button);

        expect(writeText.calledOnceWithExactly(url)).to.be.true;
        expect(notify.calledOnceWithExactly('Post link copied', {type: 'success'})).to.be.true;
        expect(rowClick.called).to.be.false;
    });

    it('shows an error rather than success when clipboard access is denied', async function () {
        sinon.stub(navigator.clipboard, 'writeText').rejects(new Error('Permission denied'));
        const notifications = this.owner.lookup('service:notifications');
        const notify = sinon.stub(notifications, 'showNotification');
        const alert = sinon.stub(notifications, 'showAlert');
        this.set('post', {isPublished: true, url: 'https://example.com/published/'});

        await render(hbs`<PostsList::CopyLink @post={{this.post}} />`);
        await click(button);

        expect(notify.called).to.be.false;
        expect(alert.calledOnceWithExactly('Could not copy post link. Please try again.', {type: 'error'})).to.be.true;
    });
});
