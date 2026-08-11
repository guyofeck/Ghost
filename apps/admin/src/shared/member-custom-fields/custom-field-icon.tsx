import {LucideIcon} from '@tryghost/shade/utils';
import type {MemberCustomField} from '@tryghost/admin-x-framework/api/member-custom-fields';

/**
 * Short text's icon, as admin-x-design-system drew it before the Lucide migration
 * (573152c125) deleted `aa.svg` and mapped the type onto Lucide's `Type` in the same sweep.
 *
 * Set in the UI's own font rather than drawn, which is what made it read as text at all — the
 * font picker in Settings shows a chosen face the same way. Kept as an svg so it sizes and
 * colours through className exactly as the Lucide icons beside it do.
 *
 * Lighter than the 600 it was drawn at: a letterform is solid where a Lucide icon is a 1.5px
 * stroke, so matching weights on paper puts far more ink on the page in practice.
 */
const ShortTextIcon = ({className}: {className?: string}) => (
    <svg className={className} height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg">
        <text fill="currentColor" fontSize="19" fontWeight="500" textAnchor="middle" x="12" y="18.5">Aa</text>
    </svg>
);

type FieldIcon = React.FC<{className?: string}>;

const icons: Record<MemberCustomField['type'], FieldIcon> = {
    short_text: ShortTextIcon,
    long_text: LucideIcon.AlignLeft,
    address: LucideIcon.MapPin
};

const CustomFieldIcon: React.FC<{type: MemberCustomField['type']; className?: string}> = ({type, className}) => {
    const Icon = icons[type] || LucideIcon.Type;
    return <Icon className={className} />;
};

export default CustomFieldIcon;
