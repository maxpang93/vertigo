# -*- coding: utf-8 -*-
# Copyright (c) 2022, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe.model.document import Document
from frappe import _

class AssetBookingLog(Document):
	def on_trash(self):
		frappe.throw(_("Logs can never be deleted"))

@frappe.whitelist()
def get_events(start, end, filters=None):
	from frappe.desk.calendar import get_event_conditions
	conditions = get_event_conditions("Asset Booking Log", filters)
	events = [] 
	query = """
		SELECT 
			`tabAsset Booking Log`.name, 
			`tabAsset Booking Log`.asset, 
			`tabAsset`.asset_name, 
			`tabAsset Booking Log`.from_date, 
			`tabAsset Booking Log`.to_date, 
			`tabAsset Booking Log`.project, 
			`tabAsset Booking Log`.requesting_employee, 
			`tabEmployee`.first_name
		FROM `tabAsset Booking Log`
		LEFT JOIN `tabAsset` ON `tabAsset Booking Log`.asset = `tabAsset`.name 
		LEFT JOIN `tabEmployee` ON `tabAsset Booking Log`.requesting_employee = `tabEmployee`.name
		WHERE (`tabAsset Booking Log`.from_date >= %(start)s OR `tabAsset Booking Log`.to_date <= %(end)s) AND `tabAsset Booking Log`.docstatus = 1 {conditions}
	""".format(conditions=conditions)	
	print(query)
			
	for d in  frappe.db.sql(query,{"start":start,"end":end}, as_dict=True):
		events.append({
			"name": d.name,
			"from_date": d.from_date,
			"to_date": d.to_date,
			"asset_name": d.asset_name,
			"project": d.project,
			"requesting_employee": d.first_name,
			"title": f"{d.asset_name} ( {d.first_name or ''} / {d.project or ''} )"
		})
	#print(f"\n events: {events} \n")
	return events