# -*- coding: utf-8 -*-
# Copyright (c) 2022, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe.model.document import Document
from frappe import _

class AssetBooking(Document):
	def on_submit(self):
		booking_items = frappe.db.get_list("Asset Booking Items", 
				filters = {"parent":self.name},
				fields = ["name","asset","current_location","required_location","from_date","to_date","project","custodian"]
			)
		from datetime import datetime
		def create_asset_booking_log(item):
			log = frappe.new_doc("Asset Booking Log")
			log.asset = item.asset
			log.current_location = item.current_location
			log.from_date = item.from_date
			log.to_date = item.to_date
			log.required_location = item.required_location
			log.custodian = item.custodian
			log.project = item.get("project")
			log.posting_date = datetime.now()
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
	def get_asset_total_issued(self, asset): ## DEPRECATED
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
	def get_asset_total_returned(self, asset): ## DEPRECATED
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
	def get_total_asset_issued_and_returned(self,asset): ## DEPRECATED
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
			##return None #for testing
			return {
				"err_msg": f"Asset {asset} ({frappe.get_doc('Asset',asset).asset_name}) has no 'Available For Use date'"
			}
		_available_for_use_date = datetime.strptime(str(available_for_use_date), '%Y-%m-%d')

		if _from_date < _available_for_use_date:
			return {
				"err_msg": f"Asset only available on <b>{available_for_use_date}</b> onwards"
			}

	def check_asset_booking_conflict(self, asset, from_date, to_date=None): ## Max: include maintenance log
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
	def check_booking_items_conflict(self, booking_items): ## max: had problem calling from backend's before_save and reload_doc. Now calling from frontend and return "available" & "remarks", then only save back to backend
		for item in booking_items:
			[item["available"], item["remarks"]] = self.check_asset_booking_conflict(item["asset"], item["from_date"], item.get("to_date"))
		return booking_items

	def auto_make_asset_issue_return(self,asset_booking): ## DEPRECATED
		from erpnext.assets.doctype.asset_journal.asset_journal import make_asset_issue, make_asset_return
		make_asset_return(
			make_asset_issue(asset_booking)
		)

	@frappe.whitelist()
	def update_latest_asset_location(self, name): ## DEPRECARED: after every asset movement, auto update all booking_items' "current_location"
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

	@frappe.whitelist()
	def update_booking_items(self, asset_booking, children, selected, deleted=None):
		
		def update_idx_deprecated(children): ## directly update from popup dialog's idx, but some entries won't appear in dialog because already issued & returned
			for item in children:
				frappe.db.set_value("Asset Booking Items", item["name"], {
					"idx": item["idx"]
				})
		
		def __update_idx(asset_booking):
			items = frappe.db.get_list("Asset Booking Items",
				filters = {"parent":asset_booking},
				fields = ["idx","name"],
				order_by = "idx"
			)
			print(f'\n items: {items}')
			new_idx = 0
			for item in items:
				new_idx += 1
				if item.idx == new_idx:
					## print(f"\n NOT updating idx")
					continue
				frappe.db.set_value("Asset Booking Items", item["name"], {
					"idx": new_idx
				})

		if deleted:
			to_delete = [(o["name"],o["asset_booking_log"]) for o in deleted]
			for booking_item, asset_booking_log in to_delete:
				##print(f'\n {booking_item} \t {asset_booking_log}')
				self.__cancel_log(booking_item, asset_booking_log)
				frappe.get_doc("Asset Booking Items", booking_item).delete()

		for item in selected:
			booking_item = item["name"]
			update = item.copy()
			update.pop("name") 
			update.pop("docname",None) # None: default return value, if no 'docname' key, won't throw error
			update.pop("__checked", None)
			##print(f'\n item: {item}')
			##print(f'\n update: {update}')
			frappe.db.set_value("Asset Booking Items", booking_item, update)
			
			row = frappe.get_doc("Asset Booking Items", booking_item) # get log before detach from booking_item
			
			self.__cancel_log(booking_item, row.asset_booking_log)

			item.update({
				"project": row.project,
				"current_location": frappe.get_doc("Asset", row.asset).location,
			})
			self.__make_log(item)

		__update_idx(asset_booking) ## update booking_items' idx after entire execution successful
		return

	def __cancel_log(self,booking_item, booking_log): # must get booking_log before detach from booking_item
		frappe.db.set_value("Asset Booking Items", booking_item, {
				"asset_booking_log": None, # Cannot cancel log if attached to booking_item
				"docstatus": 2, # Cannot delete if submitted -> manual force-"cancel"
			})
		log = frappe.get_doc("Asset Booking Log",booking_log)
		try:
			log.cancel()
		except:
			raise Exception("Error when cancelling Asset Booking Log")

	def __make_log(self, args): ## args := booking_item
		from datetime import datetime
		log = frappe.new_doc("Asset Booking Log")
		try: 
			log.asset = args["asset"]
			log.current_location = args["current_location"] #//
			log.from_date = args["from_date"]
			log.to_date = args.get("to_date")
			log.required_location = args["required_location"]
			log.custodian = args["custodian"]
			log.project = args.get("project") #//
			log.posting_date = datetime.now()
			log.insert()
			log.submit()
		except:
			raise Exception("Error when creating Asset Booking Log")
		if args.get("name"): ## if args has "name", update booking log
			frappe.db.set_value("Asset Booking Items",args["name"], { "asset_booking_log" : log.name })
