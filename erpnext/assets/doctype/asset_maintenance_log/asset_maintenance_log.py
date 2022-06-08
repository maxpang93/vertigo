# -*- coding: utf-8 -*-
# Copyright (c) 2017, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe.model.document import Document
from frappe import _
from frappe.utils import nowdate, getdate
from erpnext.assets.doctype.asset_maintenance.asset_maintenance import calculate_next_due_date
from datetime import date, datetime

class AssetMaintenanceLog(Document):
	def validate(self): ## triggered before before_save()
		now = datetime.now()
		if self.maintenance_status not in ["Completed","Cancelled"]:
			if _fmt_datetime(self.start_date):
				self.maintenance_status = "In Progress"
			if not _fmt_datetime(self.start_date):
				if now < _fmt_datetime(self.scheduled_start_date):
					self.maintenance_status = "Planned"
				if now > _fmt_datetime(self.scheduled_start_date):
					self.maintenance_status = "Delayed"
				if now > _fmt_datetime(self.scheduled_end_date): ## if True, replaces status "Delayed" => "Overdue"
					self.maintenance_status = "Overdue"
	
		if self.maintenance_status == "Completed" and not self.completion_date:
			frappe.throw(_("Please select Completion Date for Completed Asset Maintenance Log"))

		if self.maintenance_status != "Completed" and self.completion_date:
			frappe.throw(_("Please select Maintenance Status as Completed or remove Completion Date"))

		#frappe.throw(_('test'))
		self.update_maintenance_schedule()
		self.update_asset_status()

	#def after_save(self):
	#	self.update_maintenance_schedule() ## doesn't update ?? thought succcesfully updated? 

	def on_submit(self):
		if self.maintenance_status not in ['Completed', 'Cancelled']:
			frappe.throw(_("Maintenance Status has to be Cancelled or Completed to Submit"))
		##self.update_maintenance_task()
		self.update_maintenance_schedule()
		self.update_booking_availability()

	def update_maintenance_schedule(self):
		print("update_maintenance_schedule => ")
		# 1. status
		schedule = frappe.get_doc("Asset Maintenance Schedule", self.maintenance_schedule)
		schedule.db_set("maintenance_status",self.maintenance_status)
		# add more if needed

	def update_asset_status(self):
		doc = frappe.get_doc("Asset", self.asset_name)
		if self.maintenance_status == "In Progress":
			doc.db_set("asset_status","In Maintenance")
		if self.maintenance_status == "Completed":
			doc.db_set("asset_status","Idle")
			

	def update_booking_availability(self):
		print("update_booking_availability => ")
		query = f"""
				SELECT a.asset_name, l.from_date, l.to_date, e.user_id, l.docstatus FROM `tabAsset Booking Log` l 
				LEFT JOIN `tabEmployee` e ON e.name=l.custodian 
				LEFT JOIN `tabAsset` a ON a.name=l.asset 
				WHERE l.asset='{self.asset_name}' 
					AND ( 
						(l.from_date < '{self.completion_date}' AND '{self.start_date}' < l.to_date)
							OR
						(l.from_date < '{self.completion_date}' AND l.to_date IS NULL) 
					) 
					AND l.docstatus=1
			"""
		print(query)
		for log in frappe.db.sql(query, as_dict=1):
			msg = f"Asset Maintenance of {self.asset_name} delayed, which starts from {self.start_date} until {self.completion_date}."
			_alert_booking_custodian(self, log.user_id, msg)

	@frappe.whitelist()
	def test(self):
		##self.update_booking_availability()
		#doc = frappe.get_doc("Asset",self.asset_name)
		#doc.db_set("asset_status", "In Maintenance")
		return


	def update_maintenance_task(self): ## DEPRECATED
		asset_maintenance_doc = frappe.get_doc('Asset Maintenance Task', self.task)
		if self.maintenance_status == "Completed":
			if asset_maintenance_doc.last_completion_date != self.completion_date:
				next_due_date = calculate_next_due_date(periodicity = self.periodicity, last_completion_date = self.completion_date)
				asset_maintenance_doc.last_completion_date = self.completion_date
				asset_maintenance_doc.next_due_date = next_due_date
				asset_maintenance_doc.maintenance_status = "Planned"
				asset_maintenance_doc.save()
		if self.maintenance_status == "Cancelled":
			asset_maintenance_doc.maintenance_status = "Cancelled"
			asset_maintenance_doc.save()
		asset_maintenance_doc = frappe.get_doc('Asset Maintenance', self.asset_maintenance)
		asset_maintenance_doc.save()

@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs 
def get_maintenance_tasks(doctype, txt, searchfield, start, page_len, filters): ##DEPRECATED
	asset_maintenance_tasks = frappe.db.get_values('Asset Maintenance Task', {'parent':filters.get("asset_maintenance")}, 'maintenance_task')
	return asset_maintenance_tasks

def _fmt_datetime(dt):
	if isinstance(dt, datetime):
		return dt
	if isinstance(dt, date):
		return datetime(dt.year,dt.month,dt.day)
	if isinstance(dt, str):
		try:
			return datetime.strptime(dt,"%Y-%m-%d %H:%M:%S")
		except:
			return None ## if parse fails
	return None ## all other cases


def _alert_booking_custodian(doc, user, message):
	plog("_alert_booking_custodian")
	"""
	modified from multiple functions across several modules: Notification (n), Notification Log (nl)
	n -> create_system_notification()
	nl -> enqueue_create_notification()
	nl -> make_notification_logs()
	"""
	from frappe.email.doctype.notification.notification import get_context
	import json
	context = get_context(doc)
	if doc.get("_comments"):
		context["comments"] = json.loads(doc.get("_comments"))

	notification_args = {
		"type": "Mention", #* No 'Alert', new type in v13
		"document_type": doc.doctype,
		"document_name": doc.name,
		"subject": message,
		"from_user": doc.modified_by or doc.owner,
		##"email_content": frappe.render_template(self.message, context), #* copied from version-13
		##"attached_file": attachments and json.dumps(attachments[0]), #*
	}

	## see frappe.desk.doctype.notification_log.notification_log for reason
	if frappe.flags.in_install:
		return

	"""  ## frappe.enqueue() doesn't work!!
	frappe.enqueue( ## why must queue? 
		"erpnext.assets.doctype.asset_maintenance_log.asset_maintenance_log._make_notification_log",
		args=notification_args,
		user=user,
		now=frappe.flags.in_test
	)
	"""
	_make_notification_log(notification_args, user)

def _make_notification_log(args,user):
	plog("_make_notification_log")
	if not user:
		return
	_doc = frappe.new_doc("Notification Log")
	_doc.update(args)
	_doc.for_user = user
	if _doc.for_user != _doc.from_user:
		_doc.insert(ignore_permissions=True)  ## TODO send email error => "Please setup default Email Account from Setup > Email > Email Account" 
		## unticked "enabled_email_notification" at Email Account, working for now

def daily_check_maintenance_log_status():
	now = datetime.now()
	print(f"\n\ndaily_check_maintenance_log_status => {now}\n")
	logs = frappe.db.get_list("Asset Maintenance Log",
		filters = {
			'maintenance_status': ('not in', ['In Progress','Completed', 'Cancelled', 'Overdue'])
		},
		fields = ['name']
	)
	print(f"{len(logs)}")
	for l in logs:
		doc = frappe.get_doc('Asset Maintenance Log',l.name)
		print(doc.maintenance_status)
		if doc.maintenance_status == 'Planned' and not _fmt_datetime(doc.start_date):
			if now > _fmt_datetime(doc.scheduled_end_date):
				doc.db_set('maintenance_status', 'Overdue')
			elif now > _fmt_datetime(doc.scheduled_start_date):
				doc.db_set('maintenance_status', 'Delayed')
			doc.update_maintenance_schedule()
	return

def plog(msg):
	print(f"\n {msg}")