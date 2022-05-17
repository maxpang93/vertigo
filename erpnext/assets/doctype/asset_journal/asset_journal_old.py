# -*- coding: utf-8 -*-
# Copyright (c) 2022, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe.model.document import Document
from frappe import _
from frappe.model.mapper import get_mapped_doc

class AssetJournal(Document):
	def on_submit(self):
		journal_items = frappe.db.get_list("Asset Journal Items", 
				filters = { "parent": self.name },
				fields = ["name","asset","from_location","to_location","from_custodian","to_custodian","transaction_type","asset_journal_log"]
			)
		print(f"\n {journal_items}")
		from datetime import datetime
		def create_asset_journal_log(item):
			log = frappe.new_doc("Asset Journal Log")
			log.asset = item.asset
			log.from_location = item.from_location
			log.to_location = item.to_location
			log.from_custodian = item.from_custodian
			log.to_custodian = item.to_custodian
			log.transaction_type = item.transaction_type
			log.posting_date = datetime.now()
			log.insert()
			return log
		try:
			for item in journal_items:
				log = None
				if item.asset_journal_log: ## log is already created if triggered from asset booking
					print(f"\n didn't create log because already exist")
					log = frappe.get_doc("Asset Journal Log", item.asset_journal_log)
				else:
					log = create_asset_journal_log(item)
					frappe.db.set_value("Asset", item.asset, {
						"location": item.to_location,
						"custodian": item.to_custodian,
						"asset_status": "In Use" if self.transaction_type == "Issue" else "Idle",
					})
					frappe.db.set_value("Asset Journal Items", item.name, {
						"asset_journal_log": log.name
					})
					##frappe.get_doc("Asset Journal Items", item.name).submit()
				log.submit() ## journal log's on_submit() will update all booking_items' current_location
		except:
			raise Exception("Error when creating Asset Journal Log")

	def on_cancel(self):
		frappe.throw(_("Submitted Asset Movement Journal cannot be cancelled. If issued, please return instead"))
		"""
		journal_items = frappe.db.get_list("Asset Journal Items", 
			filters = { "parent": self.name },
			fields = ["asset_journal_log"]
		)
		
		for item in journal_items:
			try:
				log = frappe.get_doc("Asset Journal Log",item.asset_journal_log)
				log.cancel()
			except:
				frappe.throw(_("Error cancelling Asset Booking Log"))
		"""

	def on_trash(self):
		if self.docstatus in [1,2]: ## Cancelled or Submitted
			frappe.throw(_("Submitted or Cancelled records cannot be deleted"))

def make_log(args): ## args := journal item
	from datetime import datetime
	print(f"\nmaking log")
	print(args.get("asset",'failed to get asset key-value'))
	log = frappe.new_doc("Asset Journal Log")
	log.asset = args.asset
	log.from_location = args.from_location
	log.to_location = args.to_location
	log.from_custodian = args.from_custodian
	log.to_custodian = args.to_custodian
	log.transaction_type = args.transaction_type
	log.posting_date = datetime.now()
	log.insert()
	return log

@frappe.whitelist()
def make_asset_issue(asset_booking, selected_items=None):
	##print(f"\n {selected_items} \t {type(selected_items) is str}")
	if selected_items and isinstance(selected_items, str):
		import json
		selected_items = json.loads(selected_items)

	doc = frappe.new_doc("Asset Journal")
	doc.transaction_type = "Issue"
	doc.booking_request = asset_booking

	booking = frappe.db.get_list("Asset Booking",
			filters = { "name": asset_booking }, 
			fields = ["name","company","posting_date","requesting_employee","project"]
		)[0]
	doc.company = booking.company
	doc.posting_date = booking.posting_date
	doc.requesting_employee = booking.requesting_employee
	doc.project = booking.project
	doc.insert()
	##print(f"\n after create parent doc")
	
	from datetime import datetime
	def add_item(parent, item):
		print(f"\n item => {item}")
		child = frappe.new_doc("Asset Journal Items")
		#child.docstatus = doc.docstatus
		child.parent = parent.name
		child.parentfield = "journal_items"
		child.parenttype = "Asset Journal"
		child.asset = item["asset"] #or item.asset
		child.from_location = item["current_location"] #or item.current_location
		child.to_location = item["required_location"] #or item.required_location
		child.from_custodian = frappe.get_doc("Asset",item["asset"]).custodian #or frappe.get_doc("Asset", item.asset).custodian
		child.to_custodian = item["custodian"] #or item.custodian
		child.posting_date = datetime.now()
		child.asset_booking = parent.booking_request
		child.project = parent.project
		#print(f"\n asset_issue table row => {child.to_custodian}\t {booking.requesting_employee}")
		child.insert()
		print(f"\n journal item row: {child.name}")
		log = make_log(child)
		frappe.db.set_value("Asset", child.asset, {
					"location": child.to_location,
					"custodian": child.to_custodian,
					"asset_status": "In Use" if parent.transaction_type == "Issue" else "Idle",
				})
		frappe.db.set_value("Asset Journal Items", child.name, {
					"asset_journal_log": log.name
                })
		frappe.db.set_value("Asset Booking Items", item["name"], {
					"asset_issue_journal_log": log.name
				})
		##log.submit() ## on_submit() will update all booking_items' current_location
		print(f'\n {log.name}, {log.docstatus}')

	##print(f"\n before create child items")
	if selected_items:
		##print(f"\n {selected_items}")
		for selected in selected_items:
			print(f"\n item => {selected}")
			if isinstance(selected, str):
				item = frappe.db.get_value('Asset Booking Items', selected, ["name","asset","current_location","required_location","custodian"], as_dict=1)
				add_item(doc, item)
			else:
				add_item(doc, selected)
	else: 
		booking_items = frappe.db.get_list("Asset Booking Items", 
			filters = {"parent": asset_booking},
			fields = ["name","asset","current_location","required_location, custodian"]
		)
		for item in booking_items:
			add_item(doc, item)
	
	##print(f"\n after create child items")
	doc.submit()
	print(f'\n {doc.docstatus}')
	return doc.name

@frappe.whitelist()
def make_asset_return(asset_issue, selected_items=None):
	if selected_items and isinstance(selected_items, str):
		import json
		selected_items = json.loads(selected_items)

	doc = frappe.new_doc("Asset Journal")
	doc.transaction_type = "Return"
	doc.asset_issue = asset_issue

	issue = frappe.db.get_list("Asset Journal",
			filters = { "name": asset_issue }, 
			fields = ["company","posting_date","requesting_employee","project"]
		)[0]
	doc.company = issue.company
	doc.posting_date = issue.posting_date
	doc.requesting_employee = issue.requesting_employee
	doc.project = issue.project
	doc.insert()

	from datetime import datetime
	def add_item(parent, item):
		print(f"\n item => {item}")
		child = frappe.new_doc("Asset Journal Items")
		child.parent = parent.name
		child.parentfield = "journal_items"
		child.parenttype = "Asset Journal"
		child.asset = item["asset"]
		child.from_location = item["current_location"]
		child.to_location = item["required_location"]
		child.from_custodian = frappe.get_doc("Asset",item["asset"]).custodian
		child.to_custodian = item["custodian"]
		child.posting_date = datetime.now()
		child.asset_booking = parent.booking_request
		child.project = parent.project
		child.insert()

	if selected_items:
		for selected in selected_items:
			if isinstance(selected, str):  ## remove else if selected is row's name
				item = frappe.db.get_value('Asset Booking Items', selected, ["asset","current_location","required_location","custodian"], as_dict=1)
				add_item(doc, item)
			else:
				add_item(doc, selected)
	else:
		issue_items = frappe.db.get_list("Asset Journal Items",
			filters = {"parent": asset_issue},
			fields = ["asset","from_location","to_location","from_custodian","to_custodian"]
		)
		for item in issue_items:
			add_item(doc, item)
	
	
	for item in issue_items:
		child = frappe.new_doc("Asset Journal Items")
		#child.docstatus = doc.docstatus
		child.parent = doc.name
		child.parentfield = "journal_items"
		child.parenttype = "Asset Journal"
		child.asset = item.asset
		child.from_location = item.to_location
		child.to_location = item.from_location
		child.from_custodian = item.to_custodian
		child.to_custodian = item.from_custodian
		#print(f"\n asset_return table row => {child.from_custodian}\t {item.to_custodian}")
		child.insert()
	
	return doc.name

@frappe.whitelist()
def create_asset_issue(source_name, target_doc=None):

	def add_details(source, target, source_parent):
		target.transaction_type = "Issue"
		target.booking_request = source.name

	doclist = get_mapped_doc("Asset Booking", source_name, {
			"Asset Booking": {
				"doctype": "Asset Journal",
				"field_map": {
					"company":"company",
					"posting_date":"posting_date",
					"custodian":"custodian",
					"project":"project",
				},
				"postprocess": add_details
			},
			"Asset Booking Items": {
				"doctype": "Asset Journal Items",
				"field_map": {
					"parent": "prevdoc_docname",
					"parenttype": "prevdoc_doctype",
					"asset": "asset",
					"current_location": "from_location",
					"required_location": "to_location",
				}
			}
		}, target_doc)

	return doclist.insert()

@frappe.whitelist()
def create_asset_return(source_name, target_doc=None):

	def add_details(source, target, source_parent):
		target.transaction_type = "Return"
		target.asset_issue = source.name

	doclist = get_mapped_doc("Asset Journal", source_name, {
			"Asset Journal": {
				"doctype": "Asset Journal",
				"field_map": {
					"company":"company",
					"posting_date":"posting_date",
					"requesting_employee":"requesting_employee",
					"project":"project",
				},
				"postprocess": add_details
			},
			"Asset Journal Items": {
				"doctype": "Asset Journal Items",
				"field_map": {
					"parent": "prevdoc_docname",
					"parenttype": "prevdoc_doctype",
					"asset": "asset",
					"from_custodian": "to_custodian",
					"to_custodian": "from_custodian",
					"from_location": "to_location",
					"to_location": "from_location"
				}
			}
		}, target_doc)

	return doclist.insert()



