import Component from '@glimmer/component';
import {action} from '@ember/object';
import {inject as service} from '@ember/service';

export default class PostsListCopyLink extends Component {
    @service notifications;

    @action
    async copyLink(event) {
        event.stopPropagation();

        try {
            await navigator.clipboard.writeText(this.args.post.url);
            this.notifications.showNotification('Post link copied', {type: 'success'});
        } catch (error) {
            this.notifications.showAlert('Could not copy post link. Please try again.', {type: 'error'});
        }
    }
}
