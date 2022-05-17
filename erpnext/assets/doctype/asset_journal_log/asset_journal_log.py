# -*- coding: utf-8 -*-
# Copyright (c) 2022, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe.model.document import Document
from frappe import _

class AssetJournalLog(Document):
	def on_submit(self):
		## update all booking_items' asset current_location	
		booking_items = frappe.db.get_list("Asset Booking Items",
			filters = { "asset": self.asset }, 
			fields = ["name"]
		)
		for item in booking_items:
			frappe.db.set_value("Asset Booking Items",item.name, {
				"current_location": self.to_location
			})

	def on_trash(self):
		frappe.throw(_("Logs can never be deleted"))

