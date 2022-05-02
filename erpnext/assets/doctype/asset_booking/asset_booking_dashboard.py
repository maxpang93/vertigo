from __future__ import unicode_literals
from frappe import _

def get_data():
	return {
		'fieldname': 'asset_booking',
		'non_standard_fieldnames': {
			'Asset Journal': 'booking_request'
		},
		'transactions': [
			{
				'label': _('Asset Issue Journal'),
				'items': ['Asset Journal']
			}
		]
	}