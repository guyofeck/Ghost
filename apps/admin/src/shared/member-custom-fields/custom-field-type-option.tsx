import CustomFieldIcon from '@/shared/member-custom-fields/custom-field-icon';
import {userTypeForFieldType} from '@tryghost/admin-x-framework/api/member-custom-fields';
import type {MemberCustomField} from '@tryghost/admin-x-framework/api/member-custom-fields';

/**
 * A field type as it appears in a picker: its icon and its name.
 *
 * Shared so the two places a publisher chooses a type — Settings and the members import —
 * present them identically, and so a type's icon is decided once.
 */
export function CustomFieldTypeOption({type}: {type: MemberCustomField['type']}) {
    return (
        <span className="flex items-center gap-2">
            {/* Fixed width so labels line up in a column whatever shape the icon is. */}
            <span className="flex w-5 shrink-0 items-center justify-center">
                <CustomFieldIcon className="size-4" type={type} />
            </span>
            <span>{userTypeForFieldType(type).label}</span>
        </span>
    );
}
