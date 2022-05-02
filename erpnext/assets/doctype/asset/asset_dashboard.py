from __future__ import unicode_literals
from frappe import _

def get_data():
	return {
		'fieldname': 'asset_name',
		'non_standard_fieldnames': {
			'Asset Movement': 'asset',
			'Asset Booking': 'asset',
			'Asset Booking Log': 'asset',
			'Asset Journal': 'asset',
			'Asset Journal Log': 'asset',
		},
		'transactions': [
			{
				'label': _('Maintenance'),
				'items': ['Asset Maintenance', 'Asset Maintenance Log']
			},
			{
				'label': _('Repair'),
				'items': ['Asset Repair']
			},
			{
				'label': _('Movement'),
			#	'items': ['Asset Movement']
				'items':['Asset Journal', 'Asset Journal Log']
			},
			{
				'label': _('Booking'),
				'items': ['Asset Booking', 'Asset Booking Log']
			}
		]
	}
