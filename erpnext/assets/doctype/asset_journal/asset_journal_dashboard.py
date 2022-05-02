from __future__ import unicode_literals
from frappe import _

def get_data():
	return {
		'fieldname': 'asset_journal',
		'non_standard_fieldnames': {
			'Asset Journal': 'asset_issue'
		},
		'transactions': [
			{
				'label': _('Asset Return Journal'),
				'items': ['Asset Journal']
			}
		]
	}