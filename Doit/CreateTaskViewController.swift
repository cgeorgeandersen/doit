//
//  CreateTaskViewController.swift
//  Doit
//
//  Created by Kaitlyn  Caracciolo on 2/17/19.
//  Copyright © 2019 George Andersen. All rights reserved.
//

import UIKit

class CreateTaskViewController: UIViewController {

    @IBOutlet weak var importantSwitch: UISwitch!
    @IBOutlet weak var taskNameTextField: UITextField!
    
    var previousVC = TasksViewController()
    
    
    
    override func viewDidLoad() {
        super.viewDidLoad()

        // Do any additional setup after loading the view.
    }
    
    @IBAction func addTapped(_ sender: Any) {
        //Create a task from the task outlet information
        
        let task = Task()
      
        task.name = taskNameTextField.text!
        task.important = importantSwitch.isOn
        
        //Add new task to array in previous view controller
        
        previousVC.tasks.append(task)
        previousVC.tableview.reloadData()
        navigationController!.popViewController(animated: true)
        
        
    }
    
   

}
