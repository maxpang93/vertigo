// Copyright (c) 2015, Frappe Technologies Pvt. Ltd. and Contributors
// License: GNU General Public License v3. See license.txt

frappe.views.calendar["Asset Booking Log"] = {
	field_map: {
		"start": "from_date",
		"end": "to_date",
		"id": "name",
		/*
		"title": "title",
		"project": "project",
		"asset": "asset",
		"requesting_employee": "requesting_employee",
		*/
		"allDay": "allDay"
	},
	/*
	options: {
		header: {
			left: 'prev,next today',
			center: 'title',
			right: 'month'
		}
	},
	*/
	get_events_method: "erpnext.assets.doctype.asset_booking_log.asset_booking_log.get_events"
}