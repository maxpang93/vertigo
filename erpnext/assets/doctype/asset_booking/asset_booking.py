# -*- coding: utf-8 -*-
# Copyright (c) 2022, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
from functools import total_ordering
import frappe
from frappe.model.document import Document
from frappe import _

class AssetBooking(Document):
	def on_submit(self):
		booking_items = frappe.db.get_list("Asset Booking Items", 
				filters = {"parent":self.name},
				fields = ["name","asset","current_location","required_location","from_date","to_date","project","custodian"]
			)
		def create_asset_booking_log(item):
			log = frappe.new_doc("Asset Booking Log")
			log.asset = item.asset
			log.current_location = item.current_location
			log.from_date = item.from_date
			log.to_date = item.to_date
			log.required_location = item.required_location
			log.custodian = item.custodian
			log.project = item.get("project")
			log.insert()
			return log
		try:
			for item in booking_items:
				log = create_asset_booking_log(item)	
				frappe.db.set_value("Asset Booking Items",item.name, {
					"asset_booking_log" : log.name
				})
				log.submit()
		except:
			raise Exception("Error when creating Asset Booking Log")
		##self.auto_make_asset_issue_return(self.name) user issue/return when needed

	def on_cancel(self):
		booking_items = frappe.db.get_list("Asset Booking Items", 
			filters = { "parent": self.name },
			fields = ["asset_booking_log"]
		)
		
		for item in booking_items:
			try:
				log = frappe.get_doc("Asset Booking Log",item.asset_booking_log)
				log.cancel()
			except:
				frappe.throw(_("Error cancelling Asset Booking Log"))
	
	#def on_trash(self):
	#	if self.docstatus in [1,2]: ## Cancelled or Submitted
	#		frappe.throw(_("Asset Booking records not allowed to delete"))

	@frappe.whitelist()
	def get_asset_total_issued(self, asset):
		issued_logs = frappe.db.get_list("Asset Journal Log",
			filters = {
					"asset_booking": self.name, #max, apa ni o? no wonder now working
					"transaction_type": "Issue",
					"asset": asset,
				},
			fields = ["name"],
		)
		print(f"testing => issued_logs\n {issued_logs}")
		return len(issued_logs)

	@frappe.whitelist()
	def get_asset_total_returned(self, asset):
		print(f"testing => asset_booking\n {self.name}")
		returned_logs = frappe.db.get_list("Asset Journal Log",
			filters = {
					"asset_booking": self.name, #max, apa ni o? no wonder now working
					"transaction_type": "Issue",
					"asset": asset,
				},
			fields = ["name"],
		)
		print(f"testing => returned_logs\n {returned_logs}")
		return len(returned_logs)	

	@frappe.whitelist()
	def get_total_asset_issued_and_returned(self,asset):
		print(f"testing => asset\n {asset}")
		total_issued = self.get_asset_total_issued(asset)
		total_returned = self.get_asset_total_returned(asset)
		print(f"testing => total_issued\n {total_issued}")
		print(f"testing => total_returned\n {total_returned}")

		return {
			"total_issued": total_issued,
			"total_returned": total_returned 
		}

	@frappe.whitelist()
	def check_asset_availability(self, asset, from_date):
		from datetime import datetime
		_from_date = datetime.strptime(from_date, '%Y-%m-%d %H:%M:%S')

		available_for_use_date = frappe.get_doc("Asset",asset).available_for_use_date
		if not available_for_use_date:
			return None
			return {
				"err_msg": f"Asset {asset} ({frappe.get_doc('Asset',asset).asset_name}) has no 'Available For Use date'"
			}
		_available_for_use_date = datetime.strptime(str(available_for_use_date), '%Y-%m-%d')

		if _from_date < _available_for_use_date:
			return {
				"err_msg": f"Asset only available on <b>{available_for_use_date}</b> onwards"
			}

	def check_asset_booking_conflict(self, asset, from_date, to_date=None):
		available = True
		remarks = None
		print(f"\n {asset} {from_date} {to_date}")
		logs = None
		if to_date:
			query = f"""
					SELECT a.asset_name, l.from_date, l.to_date, e.first_name, l.docstatus FROM `tabAsset Booking Log` l 
					LEFT JOIN `tabEmployee` e ON e.name=l.custodian 
					LEFT JOIN `tabAsset` a ON a.name=l.asset 
					WHERE l.asset='{asset}' 
						AND ( (l.from_date BETWEEN '{from_date}' AND '{to_date}') OR (l.to_date BETWEEN '{from_date}' AND '{to_date}') OR (l.from_date < '{from_date}' AND l.to_date IS NULL) ) 
						AND l.docstatus=1
				"""
			print(f"\n{query}")
			logs = frappe.db.sql(query, as_dict=1)
		else:
			query = f"""
					SELECT a.asset_name, l.from_date, l.to_date, e.first_name, l.docstatus FROM `tabAsset Booking Log` l 
					LEFT JOIN `tabEmployee` e ON e.name=l.custodian 
					LEFT JOIN `tabAsset` a ON a.name=l.asset 
					WHERE l.asset='{asset}' 
						AND ( l.to_date >= '{from_date}' OR (l.from_date < '{from_date}' AND l.to_date IS NULL) )
						AND l.docstatus=1
				"""
			print(f"\n{query}")
			logs = frappe.db.sql(query, as_dict=1)

		print(f"\n logs: {logs}")
		if len(logs) > 0 :
			available = False
			msgs = []

			from datetime import datetime
			def fmtdatetime(dt):
				if isinstance(dt,datetime):
					return dt.strftime('%Y-%m-%d %H:%M')
				elif isinstance(dt,str):
					return dt
			
			for l in logs:
				##print(f"From Date: \n{l.from_date}\n {type(l.from_date)} \n {l.from_date.strftime('%Y-%m-%d %H:%M')}")
				msg = f"{l.asset_name} booked by {l.first_name} from {fmtdatetime(l.from_date)} {f'to {fmtdatetime(l.to_date)}' if l.to_date else ''}"
				msgs.append(msg)
			remarks = "\n\n".join(msgs)
		else:
			doc = frappe.get_doc("Asset",asset)
			remarks = f"{doc.asset_name}"

		print(f"\n Remarks: {remarks}")
		return [available, remarks]

	@frappe.whitelist()
	def check_booking_items_conflict(self, booking_items):
		for item in booking_items:
			[item["available"], item["remarks"]] = self.check_asset_booking_conflict(item["asset"], item["from_date"], item.get("to_date"))
		return booking_items

	def auto_make_asset_issue_return(self,asset_booking):
		from erpnext.assets.doctype.asset_journal.asset_journal import make_asset_issue, make_asset_return
		make_asset_return(
			make_asset_issue(asset_booking)
		)

	@frappe.whitelist()
	def update_latest_asset_location(self, name): # max continue here
		print(f'\n update_latest_asset_location =>')
		booking_items = frappe.db.get_list("Asset Booking Items",
			filters = {
				"parent":name,
			}, 
			fields = ["name","asset"]
		)
		for item in booking_items:
			location = frappe.get_doc("Asset",item.asset).location
			frappe.db.set_value("Asset Booking Items",item.name, {"current_location":location})

