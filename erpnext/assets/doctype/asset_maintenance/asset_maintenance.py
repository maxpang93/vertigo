# -*- coding: utf-8 -*-
# Copyright (c) 2017, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from __future__ import unicode_literals

from pip import main
import frappe
from frappe.model.document import Document
from frappe.desk.form import assign_to
from frappe import throw, _
from frappe.utils import add_days, add_months, add_years, getdate, nowdate, get_year_ending
from erpnext.hr.doctype.holiday_list.holiday_list import is_holiday ## is_holiday(holiday_list_name, date)

from datetime import date, datetime, timedelta
from dateutil import rrule, relativedelta

from erpnext.assets.doctype.asset_booking.asset_booking import update_booking_availability

class AssetMaintenance(Document):
	## orignal: start
	def validate(self):
		for task in self.get('asset_maintenance_tasks'):
			if task.end_date and (getdate(task.start_date) >= getdate(task.end_date)):
				throw(_("Start date should be less than end date for task {0}").format(task.maintenance_task))
			if getdate(task.next_due_date) < getdate(nowdate()):
				task.maintenance_status = "Overdue"
			if not task.assign_to and self.docstatus == 0:
				throw(_("Row #{}: Please asign task to a member.").format(task.idx))

	def on_update(self):
		for task in self.get('asset_maintenance_tasks'):
			assign_tasks(self.name, task.assign_to, task.maintenance_task, task.next_due_date)
		self.sync_maintenance_tasks()

	def sync_maintenance_tasks(self):
		tasks_names = []
		for task in self.get('asset_maintenance_tasks'):
			tasks_names.append(task.name)
			update_maintenance_log(asset_maintenance = self.name, item_code = self.item_code, item_name = self.item_name, task = task)
		asset_maintenance_logs = frappe.get_all("Asset Maintenance Log", fields=["name"], filters = {"asset_maintenance": self.name,
			"task": ("not in", tasks_names)})
		if asset_maintenance_logs:
			for asset_maintenance_log in asset_maintenance_logs:
				maintenance_log = frappe.get_doc('Asset Maintenance Log', asset_maintenance_log.name)
				maintenance_log.db_set('maintenance_status', 'Cancelled')
	## original: ends
	
	@frappe.whitelist()
	def update_asset_booking_availability(self):
		print("asset_maintenance => update_asset_booking_availability")
		##_check_conflict(None,None,None)


	@frappe.whitelist()
	def make_maintenance_schedule(self):
		try:
			self._make_maintenance_schedule()
			update_booking_availability() ## TODO
		except:
			raise Exception("Error when scheduling maintenance")

	def _make_maintenance_schedule(self):
		now = datetime.now() ## don't use frappe.utils.now(). It returns str instead of datetime object
		if not self.holiday_list:
			frappe.throw(_("Please add Holiday List"))
		holiday_list = self.holiday_list
		#holiday_list = frappe.db.get_value("Company", self.company, "default_holiday_list")
		#if not holiday_list:
		#	frappe.throw(_("No default holiday list for company <b>{0}</b>. Please add at <i>Company</i>".format(self.company)))

		alert_msg = []
		for task in self.maintenance_tasks:
			#if task.periodicity in ["Daily", "Weekly"]: ##  for testing
			#	continue
			
			def postpone_if_holiday(scheduled_days):
				for i in range(len(scheduled_days)):
					while is_holiday(holiday_list, scheduled_days[i]):
						new_dt = scheduled_days[i] + timedelta(days=1)
						if new_dt.year != scheduled_days[i].year:
							scheduled_days[i] = None
							break
						scheduled_days[i] = new_dt
				return [day for day in scheduled_days if day ] ## remove None

			scheduled_start_dates = None
			if task.periodicity in ["Daily", "Weekly", "Monthly"]:
				scheduled_start_dates = _get_start_date(self.asset_name, now.year, task, now)
			if task.periodicity in ["Quarterly", "Yearly", "Twice Yearly"]:
				scheduled_start_dates = _get_start_date_long(self.asset_name, now.year, task, now)
			scheduled_start_dates = postpone_if_holiday(scheduled_start_dates) ## postponed schedule may overlap. e.g. Sat, Sun both posponed to Mon
			scheduled_start_dates = list(set(scheduled_start_dates)) ## remove the overlaps
			scheduled_start_dates.sort()

			for start_date in scheduled_start_dates:
				end_date, remarks = _get_due_date(start_date, task.duration, task.unit, holiday_list)
				self.append("maintenance_schedule",{
					"asset_name": self.asset_name,
					"company": self.company,
					"maintenance_task": task.name,
					"maintenance_status": "Planned",
					"assign_to": task.assign_to,
					"start_date": _get_start_datetime(start_date, task),
					"end_date": _get_end_datetime(end_date, task),
					"remarks": remarks
				})

		## sort by start_date and update idx(s) before save
		self.maintenance_schedule = sorted(self.maintenance_schedule, 
			key=lambda x: datetime.strptime(x.start_date, "%Y-%m-%d %H:%M:%S") if isinstance(x.start_date, str) else x.start_date)
		new_idx = 1
		for schedule in self.maintenance_schedule:
			schedule.idx = new_idx
			new_idx += 1
		self.save()
		return {
			"response": True,
			"alert_msg": alert_msg if len(alert_msg) > 0 else None
		}

def _get_start_date_long(asset_name, year, task, now=None): ## for periodicity >= Quarterly
	first_start_date = None
	months = None
	if task.periodicity == "Quarterly":
		months = 3
	if task.periodicity == "Twice Yearly":
		months = 6
	if task.periodicity == "Yearly":
		months = 12

	"""
	Objective: get first_start_date
	Objective achived: **!!
	previous maintenance logs ?
		=> yes 
			-> new_start_date = last completion date + periodicity
				new_start_date > now ?
					=> yes
						-> **!!
					=> no
						-> now **!!

		=> no
			-> now < available_for_use_date ?
				=> yes
					-> available_for_use_date + periodicity **!!
				=> no 
					-> available_for_use_date + periodicity > now ?
						=> yes
							-> **!!
						=> no
							->  now **!!
	"""
	available_for_use_date = _fmt_datetime(frappe.get_doc("Asset", asset_name).available_for_use_date)
	if not now:
		now = datetime.now()
	year_end = datetime(year+1,1,1)

	maintenance_logs = frappe.db.get_list("Asset Maintenance Log",
			filters = {
						"maintenance_status": "Completed",
						"asset_name": asset_name,
						"completion_date": (">",available_for_use_date)
				},
			fields = ["name","completion_date"],
			order_by = "completion_date asc",
		)
	
	if len(maintenance_logs) > 0:
		last_log = maintenance_logs.pop()
		last_completion_date = _fmt_datetime(last_log.completion_date)
		proposed_date = last_completion_date + relativedelta.relativedelta(months=months)
		first_start_date = proposed_date if proposed_date > now else now
	else:
		if available_for_use_date > now:
			first_start_date = available_for_use_date + relativedelta.relativedelta(months=months)
		else:
			proposed_date = available_for_use_date + relativedelta.relativedelta(months=months)
			first_start_date = proposed_date if proposed_date > now else now
	start_dates = [first_start_date]

	next_start_date = first_start_date + relativedelta.relativedelta(months=months)
	break_while = 0 #
	while next_start_date < year_end:
		start_dates.append(next_start_date)
		next_start_date +=  relativedelta.relativedelta(months=months)
		break_while += 1 #
		if break_while > 100: #
			print("\n\n possible infinite while loop, please check!")
			break

	return start_dates

def _get_all_weekdays(year, weekday, now=None):
	start = datetime(year, now.month, now.day+1) if now else datetime(year,1,1) ## if now, schedule for tomorrow
	end = datetime(year,12,31)

	byweekday = None
	if weekday.lower() == 'monday':
		byweekday = relativedelta.MO
	elif weekday.lower() == 'tuesday':
		byweekday = relativedelta.TU
	elif weekday.lower() == 'wednesday':
		byweekday = relativedelta.WE
	elif weekday.lower() == 'thursday':
		byweekday = relativedelta.TH
	elif weekday.lower() == 'friday':
		byweekday = relativedelta.FR
	elif weekday.lower() == 'saturday':
		byweekday = relativedelta.SA
	elif weekday.lower() == 'sunday':
		byweekday = relativedelta.SU

	rr = rrule.rrule(rrule.WEEKLY,byweekday=byweekday,dtstart=start)
	all_weekdays = rr.between(start,end,inc=True) ## list of datetime objects
	return all_weekdays

def _get_firstday_of_all_months(year, now=None):
	month = now.month+1 if now else 1 # if starts from now, schedule next month
	first_day_of_months = []
	while month <= 12:
		first_day_of_months.append(datetime(year,month,1))
		month += 1
	return first_day_of_months

def _get_all_days(year, now=None):
	start = datetime(year, now.month, now.day+1) if now else datetime(year,1,1)
	end = datetime(year,12,31)

	rr = rrule.rrule(rrule.DAILY,dtstart=start)
	all_dates = rr.between(start,end,inc=True) ## list of datetime objects
	return all_dates

def _get_due_date(start_date, duration, unit, holiday_list):
	end_date = _calculate_due_date(start_date, duration, unit)
	remarks = None 
	# if there's holiday between start-end date, add remarks  ##Max continue here
	day = start_date
	while day <= end_date:
		if is_holiday(holiday_list, day):
			remarks = "There is/are holiday(s) within the maintenance date(s)"
			break
		day += timedelta(days=1)
	return end_date, remarks

def _calculate_due_date(start_date,duration,unit):
	if unit.lower() == "day":
		return start_date + timedelta(days=duration-1) # Start on 1st day, duration 4 days, ends on 4th day, NOT 5th day.
	else:
		return start_date

def _get_start_date(asset_name, year,task,now=None):
	available_for_use_date = frappe.get_doc("Asset", asset_name).available_for_use_date
	if available_for_use_date:
		d =  _fmt_datetime(available_for_use_date)
		now = now if now > d else d
	if task.periodicity == "Weekly":
		return _get_all_weekdays(year, 'monday', now)
	if task.periodicity == "Monthly":
		return _get_firstday_of_all_months(year, now)
	if task.periodicity == "Daily":
		return _get_all_days(year, now)

def _get_start_datetime(start_date, task):
	start_time = frappe.get_doc("Maintenance Task", task.name).start_time ## := datetime.timedelta(seconds=######)
	return start_date + start_time

def _get_end_datetime(end_date, task):
	end_time = frappe.get_doc("Maintenance Task", task.name).end_time
	return end_date + end_time

def _fmt_datetime(dt):
	if not isinstance(dt, datetime):
		return datetime(dt.year,dt.month,dt.day)
	return dt 


## below: original functions
@frappe.whitelist()
def assign_tasks(asset_maintenance_name, assign_to_member, maintenance_task, next_due_date):
	team_member = frappe.db.get_value('User', assign_to_member, "email")
	args = {
		'doctype' : 'Asset Maintenance',
		'assign_to' : team_member,
		'name' : asset_maintenance_name,
		'description' : maintenance_task,
		'date' : next_due_date
	}
	if not frappe.db.sql("""select owner from `tabToDo`
		where reference_type=%(doctype)s and reference_name=%(name)s and status="Open"
		and owner=%(assign_to)s""", args):
		assign_to.add(args)

@frappe.whitelist()
def calculate_next_due_date(periodicity, start_date = None, end_date = None, last_completion_date = None, next_due_date = None): ## writing my own, see above
	if not start_date and not last_completion_date:
		start_date = frappe.utils.now()

	if last_completion_date and ((start_date and last_completion_date > start_date) or not start_date):
		start_date = last_completion_date
	if periodicity == 'Daily':
		next_due_date = add_days(start_date, 1)
	if periodicity == 'Weekly':
		next_due_date = add_days(start_date, 7)
	if periodicity == 'Monthly':
		next_due_date = add_months(start_date, 1)
	if periodicity == 'Yearly':
		next_due_date = add_years(start_date, 1)
	if periodicity == '2 Yearly':
		next_due_date = add_years(start_date, 2)
	if periodicity == 'Quarterly':
		next_due_date = add_months(start_date, 3)
	if end_date and ((start_date and start_date >= end_date) or (last_completion_date and last_completion_date >= end_date) or next_due_date):
		next_due_date = ""
	return next_due_date


def update_maintenance_log(asset_maintenance, item_code, item_name, task):
	asset_maintenance_log = frappe.get_value("Asset Maintenance Log", {"asset_maintenance": asset_maintenance,
		"task": task.name, "maintenance_status": ('in',['Planned','Overdue'])})

	if not asset_maintenance_log:
		asset_maintenance_log = frappe.get_doc({
			"doctype": "Asset Maintenance Log",
			"asset_maintenance": asset_maintenance,
			"asset_name": asset_maintenance,
			"item_code": item_code,
			"item_name": item_name,
			"task": task.name,
			"has_certificate": task.certificate_required,
			"description": task.description,
			"assign_to_name": task.assign_to_name,
			"periodicity": str(task.periodicity),
			"maintenance_type": task.maintenance_type,
			"due_date": task.next_due_date
		})
		asset_maintenance_log.insert()
	else:
		maintenance_log = frappe.get_doc('Asset Maintenance Log', asset_maintenance_log)
		maintenance_log.assign_to_name = task.assign_to_name
		maintenance_log.has_certificate = task.certificate_required
		maintenance_log.description = task.description
		maintenance_log.periodicity = str(task.periodicity)
		maintenance_log.maintenance_type = task.maintenance_type
		maintenance_log.due_date = task.next_due_date
		maintenance_log.save()

@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def get_team_members(doctype, txt, searchfield, start, page_len, filters):
	return frappe.db.get_values('Maintenance Team Member', { 'parent': filters.get("maintenance_team") }, "team_member")

@frappe.whitelist()
def get_maintenance_log(asset_name):
    return frappe.db.sql("""
        select maintenance_status, count(asset_name) as count, asset_name
        from `tabAsset Maintenance Log`
        where asset_name=%s group by maintenance_status""",
        (asset_name), as_dict=1)


	


	